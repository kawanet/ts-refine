// Project: the entry point that owns a set of source files and the TypeScript
// language service that powers the semantic operations (references, rename,
// move, organize-imports, code fixes). Two shapes are supported, matching how
// the library builds projects: from a tsconfig (real filesystem) and a lib-less
// in-memory project for scratch parsing.
//
// Syntactic navigation runs on each SourceFile's own freshly parsed tree (fast,
// reparsed only on edit); semantic queries go through the language service by
// file name + position, and results are mapped back onto the wrapped tree by
// position. The two stay aligned because both parse identical text.

import type {TSR} from "ts-refine"
import ts from "typescript"
import {type FileSystemHost, InMemoryFileSystemHost, RealFileSystemHost} from "./file-system.ts"
import {createLanguageServiceHost} from "./language-service-host.ts"
import type {Node} from "./node.ts"
import {dirOf, normalizePath} from "./paths.ts"
import {SourceFile} from "./source-file.ts"
import {Symbol as TsSymbol} from "./symbol.ts"

export interface ProjectOptions {
    tsConfigFilePath?: string
    useInMemoryFileSystem?: boolean
    compilerOptions?: ts.CompilerOptions
    skipLoadingLibFiles?: boolean
}

const IN_MEMORY_DEFAULTS: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
}

// The minimal language-service surface the library reaches via
// getProject().getLanguageService(). Today that is the combined "fix all" code
// fix used by the type-only import/export pass.
export interface LanguageServiceWrapper {
    getCombinedCodeFix(sourceFile: SourceFile, fixId: string, formatSettings: ts.FormatCodeSettings): {applyChanges(): void}
}

export class Project implements TSR.Project {
    private readonly fileSystem: FileSystemHost
    private readonly compilerOptions: ts.CompilerOptions
    private readonly currentDirectory: string
    private readonly sourceFiles = new Map<string, SourceFile>()
    // Read-only wrappers for program files outside the tracked set (e.g. a
    // re-exported declaration that lives in node_modules), kept apart so they
    // never appear in getSourceFiles().
    private readonly foreignWrappers = new Map<string, SourceFile>()
    private readonly tsLanguageService: ts.LanguageService
    private projectVersion = 0

    // Module resolution backed by the tracked text first, then the host fs, so
    // an in-memory file and an edited on-disk file both resolve to live content.
    private readonly moduleResolutionHost: ts.ModuleResolutionHost = {
        fileExists: (f) => this.sourceFiles.has(normalizePath(f)) || ts.sys.fileExists(f),
        readFile: (f) => this.sourceFiles.get(normalizePath(f))?.getFullText() ?? ts.sys.readFile(f),
        directoryExists: (d) => this.trackedDirectoryExists(d),
        getDirectories: (d) => ts.sys.getDirectories(d),
        realpath: ts.sys.realpath,
    }

    // A directory exists if it is on the host fs or any tracked (in-memory) file
    // lives under it. Without the second arm, module resolution skips a virtual
    // directory entirely and every relative specifier fails to resolve.
    private trackedDirectoryExists(dir: string): boolean {
        if (ts.sys.directoryExists(dir)) return true
        const prefix = normalizePath(dir) + "/"
        for (const f of this.sourceFiles.keys()) if (f.startsWith(prefix)) return true
        return false
    }

    constructor(options: ProjectOptions = {}) {
        this.fileSystem = options.useInMemoryFileSystem ? new InMemoryFileSystemHost() : new RealFileSystemHost()
        this.currentDirectory = normalizePath(".")

        // skipLoadingLibFiles keeps the default library out of the program, for
        // syntactic-only scratch projects that never need it.
        const libOptions: ts.CompilerOptions = options.skipLoadingLibFiles ? {noLib: true} : {}

        if (options.tsConfigFilePath != null) {
            // tsconfig drives both the compiler options and the initial file set.
            const configPath = normalizePath(options.tsConfigFilePath)
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
            // A missing path or malformed JSON surfaces here; fail loudly rather
            // than silently building an empty project against the wrong files.
            if (configFile.error != null) {
                throw new Error(`refine: cannot read tsconfig: ${options.tsConfigFilePath}\n${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`)
            }
            const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirOf(configPath), undefined, configPath)
            this.compilerOptions = {...parsed.options, ...options.compilerOptions, ...libOptions}
            this.tsLanguageService = this.createLanguageService()
            for (const fileName of parsed.fileNames) this.addSourceFileFromDisk(fileName)
        } else {
            // In-memory projects get resolution-friendly defaults so relative
            // `.ts` specifiers resolve; callers can still override any of them.
            this.compilerOptions = {...IN_MEMORY_DEFAULTS, ...options.compilerOptions, ...libOptions}
            this.tsLanguageService = this.createLanguageService()
        }
    }

    private createLanguageService(): ts.LanguageService {
        const host = createLanguageServiceHost({
            getCompilerOptions: () => this.compilerOptions,
            getCurrentDirectory: () => this.currentDirectory,
            getProjectVersion: () => String(this.projectVersion),
            getTrackedFileNames: () => [...this.sourceFiles.keys()],
            getTrackedText: (fileName) => this.sourceFiles.get(normalizePath(fileName))?.getFullText(),
            getTrackedVersion: (fileName) => {
                const sf = this.sourceFiles.get(normalizePath(fileName))
                return sf != null ? String(sf.scriptVersion) : undefined
            },
            directoryExists: (dir) => this.trackedDirectoryExists(dir),
        })
        return ts.createLanguageService(host, ts.createDocumentRegistry())
    }

    // --- internal coordination used by SourceFile / Node / Symbol --------------

    getTsLanguageService(): ts.LanguageService {
        return this.tsLanguageService
    }

    // Building the program (the second, semantic parse of every file) is the
    // costly half of the bridge. `programBuilt` lets callers avoid forcing it
    // when a cheaper answer suffices — see isFromExternalLibrary.
    private programBuilt = false

    getTsProgram(): ts.Program {
        const program = this.tsLanguageService.getProgram()
        if (program == null) throw new Error("refine: language service produced no program")
        this.programBuilt = true
        return program
    }

    hasProgram(): boolean {
        return this.programBuilt
    }

    getTypeChecker(): ts.TypeChecker {
        return this.getTsProgram().getTypeChecker()
    }

    // Stable wrappers per checker symbol, so the identity-based dedup the target
    // walk relies on (`includes(symbol)`) works across separate lookups.
    private readonly symbolCache = new WeakMap<ts.Symbol, TsSymbol>()
    wrapSymbol(symbol: ts.Symbol): TsSymbol {
        let wrapper = this.symbolCache.get(symbol)
        if (wrapper == null) {
            wrapper = new TsSymbol(this, symbol)
            this.symbolCache.set(symbol, wrapper)
        }
        return wrapper
    }

    // Bumped on every tracked-file edit / structural change so the language
    // service rebuilds its program against the live text.
    bumpVersion(): void {
        this.projectVersion++
    }

    getCompilerOptions(): ts.CompilerOptions {
        return this.compilerOptions
    }

    // Fill a partial FormatCodeSettings with the editor defaults (space after a
    // comma, etc.) the language service otherwise leaves off, so formatting and
    // organize-imports match the conventional output. Caller fields win.
    mergeFormatSettings(settings: ts.FormatCodeSettings): ts.FormatCodeSettings {
        return {...ts.getDefaultFormatCodeSettings(settings.newLineCharacter), ...settings}
    }

    getFileSystem(): FileSystemHost {
        return this.fileSystem
    }

    // Concise inspector so util.inspect does not serialize the language service.
    [globalThis.Symbol.for("nodejs.util.inspect.custom")](): string {
        return `Project<${this.sourceFiles.size} files>`
    }

    // Wrap a program/checker node onto its owning file's tracked tree (or a
    // read-only foreign wrapper for files outside the project).
    wrapProgramNode(node: ts.Node): Node {
        return this.wrapperForProgramSourceFile(node.getSourceFile()).wrap(node)
    }

    private wrapperForProgramSourceFile(tsSourceFile: ts.SourceFile): SourceFile {
        const norm = normalizePath(tsSourceFile.fileName)
        const tracked = this.sourceFiles.get(norm)
        if (tracked != null) return tracked
        let foreign = this.foreignWrappers.get(norm)
        if (foreign == null) {
            // Reuse the program's parsed tree — foreign files are read-only, so
            // re-parsing a large external .d.ts here would be pure waste.
            foreign = new SourceFile(this, norm, tsSourceFile.text, tsSourceFile)
            this.foreignWrappers.set(norm, foreign)
        }
        return foreign
    }

    // Resolve a module specifier from a containing file to the in-project source
    // file it targets, or undefined for an unresolved / external specifier.
    resolveModuleSpecifier(containingFile: string, specifier: string): SourceFile | undefined {
        const resolved = ts.resolveModuleName(specifier, containingFile, this.compilerOptions, this.moduleResolutionHost)
        const name = resolved.resolvedModule?.resolvedFileName
        return name != null ? this.getSourceFile(name) : undefined
    }

    // Map a node from the standalone (syntactic) tree onto the equivalent
    // program node the checker understands, by matching its range and kind.
    // Both trees parse identical text, so the ranges line up.
    toProgramNode(sourceFile: SourceFile, node: ts.Node): ts.Node | undefined {
        const programSf = this.getTsProgram().getSourceFile(sourceFile.getFilePath())
        return programSf != null ? findNodeByRange(programSf, node.pos, node.end, node.kind) : undefined
    }

    // Wrap a reference location (file + span) from the language service as a node
    // on the owning file's tree, loading a foreign wrapper when needed.
    wrapReferenceLocation(fileName: string, start: number, length: number): Node | undefined {
        const norm = normalizePath(fileName)
        let sf = this.sourceFiles.get(norm)
        if (sf == null) {
            const programSf = this.getTsProgram().getSourceFile(norm)
            if (programSf == null) return undefined
            sf = this.wrapperForProgramSourceFile(programSf)
        }
        return sf.getDescendantAtStartWithWidth(start, length)
    }

    // --- public API ------------------------------------------------------------

    getSourceFiles(paths?: string[]): SourceFile[] {
        const all = [...this.sourceFiles.values()]
        if (paths == null) return all
        const matchers = paths.map(toPathMatcher)
        const seen = new Set<SourceFile>()
        for (const sf of all) {
            if (matchers.some((m) => m(sf.getFilePath()))) seen.add(sf)
        }
        return [...seen]
    }

    getSourceFile(filePath: string): SourceFile | undefined {
        return this.sourceFiles.get(normalizePath(filePath))
    }

    getSourceFileOrThrow(filePath: string): SourceFile {
        const sf = this.getSourceFile(filePath)
        if (sf == null) throw new Error(`refine: source file not found: ${filePath}`)
        return sf
    }

    createSourceFile(filePath: string, text: string, options?: {overwrite?: boolean}): SourceFile {
        const norm = normalizePath(filePath)
        const existing = this.sourceFiles.get(norm)
        if (existing != null) {
            if (!options?.overwrite) throw new Error(`refine: source file already exists: ${filePath}`)
            existing.replaceWithText(text)
            return existing
        }
        const sf = new SourceFile(this, norm, text)
        this.sourceFiles.set(norm, sf)
        this.bumpVersion()
        return sf
    }

    getLanguageService(): LanguageServiceWrapper {
        return {
            getCombinedCodeFix: (sourceFile, fixId, formatSettings) => {
                const action = this.tsLanguageService.getCombinedCodeFix({type: "file", fileName: sourceFile.getFilePath()}, fixId, this.mergeFormatSettings(formatSettings), {})
                return {applyChanges: () => this.applyFileTextChanges(action.changes)}
            },
        }
    }

    // --- mutation plumbing -----------------------------------------------------

    private addSourceFileFromDisk(fileName: string): void {
        const norm = normalizePath(fileName)
        if (this.sourceFiles.has(norm)) return
        const text = this.fileSystem.readFileSync(norm)
        this.sourceFiles.set(norm, new SourceFile(this, norm, text))
    }

    // Add an existing on-disk file to the project (e.g. a declaration file the
    // tsconfig did not include) and return its wrapper.
    addSourceFileAtPath(filePath: string): SourceFile {
        this.addSourceFileFromDisk(filePath)
        this.bumpVersion()
        return this.getSourceFileOrThrow(filePath)
    }

    // Apply language-service text changes onto the wrapped source files. A change
    // may target a file imported but not yet tracked (e.g. a project .d.ts); load
    // it on demand so its specifier still gets rewritten.
    applyFileTextChanges(changes: readonly ts.FileTextChanges[]): void {
        for (const change of changes) {
            const norm = normalizePath(change.fileName)
            let sf = this.sourceFiles.get(norm)
            if (sf == null) {
                if (!this.fileSystem.fileExistsSync(norm)) continue
                sf = new SourceFile(this, norm, this.fileSystem.readFileSync(norm))
                this.sourceFiles.set(norm, sf)
                this.bumpVersion()
            }
            sf.applyTextChanges(change.textChanges)
        }
    }

    // Relocate a tracked file to a new path: re-key the map and repoint the
    // wrapper. The caller has already applied the specifier edits computed for
    // the rename. The wrapper object identity is preserved so references held
    // across a move stay valid.
    repathSourceFile(sourceFile: SourceFile, newPath: string): void {
        const oldNorm = sourceFile.getFilePath()
        const newNorm = normalizePath(newPath)
        this.sourceFiles.delete(oldNorm)
        sourceFile.setFilePath(newNorm)
        this.sourceFiles.set(newNorm, sourceFile)
        this.bumpVersion()
    }
}

// Turn a path or glob argument into a predicate over normalized file paths.
// Exact paths are the common CLI case; `*`/`**`/`?` globs are supported so the
// behavior matches passing a glob to the project.
function toPathMatcher(pattern: string): (filePath: string) => boolean {
    const norm = normalizePath(pattern)
    if (!/[*?]/.test(norm)) return (filePath) => filePath === norm
    const re = globToRegExp(norm)
    return (filePath) => re.test(filePath)
}

// Descend a tree to the node with the exact full-width range and kind. Used to
// cross from the standalone tree to the program tree (and back), which share
// coordinates because they parse identical text.
function findNodeByRange(root: ts.SourceFile, pos: number, end: number, kind: ts.SyntaxKind): ts.Node | undefined {
    let node: ts.Node = root
    while (!(node.pos === pos && node.end === end && node.kind === kind)) {
        let next: ts.Node | undefined
        ts.forEachChild(node, (child) => {
            if (child.pos <= pos && end <= child.end) {
                next = child
                return true
            }
            return undefined
        })
        if (next == null) return undefined
        node = next
    }
    return node
}

function globToRegExp(glob: string): RegExp {
    let out = "^"
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i]
        if (c === "*") {
            if (glob[i + 1] === "*") {
                out += ".*" // `**` spans path separators
                i++
                if (glob[i + 1] === "/") i++
            } else {
                out += "[^/]*" // `*` stays within a segment
            }
        } else if (c === "?") {
            out += "[^/]"
        } else {
            out += c.replace(/[.+^${}()|[\]\\]/, "\\$&")
        }
    }
    return new RegExp(out + "$")
}

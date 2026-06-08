import fs from "node:fs"
import path from "node:path"
import type {TSR} from "ts-refine"
import * as ts from "typescript"
import {BridgeFileSystem, normalizePath} from "./file-system.ts"
import {LanguageService} from "./language-service.ts"
import {SourceFile} from "./source-file.ts"

export type ProjectOptions = {
    compilerOptions?: ts.CompilerOptions
    skipLoadingLibFiles?: boolean
    tsConfigFilePath?: string
    useInMemoryFileSystem?: boolean
}

// Project owns source text, compiler options, and the TypeScript language
// service. It deliberately models only the project operations ts-refine uses,
// so the bridge can stay smaller than a general-purpose AST library.
export class Project implements TSR.Project {
    private readonly files = new Map<string, string>()
    private readonly versions = new Map<string, number>()
    private readonly sourceFiles = new Map<string, SourceFile>()
    private readonly fileSystem: BridgeFileSystem
    private readonly languageService: LanguageService
    private readonly compilerOptions: ts.CompilerOptions
    private readonly inMemory: boolean
    private readonly currentDirectory: string

    constructor(opts: ProjectOptions = {}) {
        this.inMemory = opts.useInMemoryFileSystem === true
        this.fileSystem = new BridgeFileSystem(this.inMemory ? this.files : undefined)

        const configPath = opts.tsConfigFilePath ? normalizePath(opts.tsConfigFilePath) : undefined
        this.currentDirectory = configPath ? path.dirname(configPath) : normalizePath(process.cwd())
        const config = configPath ? readTsConfig(configPath, opts.skipLoadingLibFiles === true) : undefined
        this.compilerOptions = {
            ...(config?.options ?? {}),
            ...(opts.compilerOptions ?? {}),
        }
        if (opts.skipLoadingLibFiles) this.compilerOptions.noLib = true

        for (const filePath of config?.fileNames ?? []) this.addDiskSourceFile(filePath)
        this.languageService = new LanguageService(this)
    }

    getCompilerOptions(): ts.CompilerOptions {
        return this.compilerOptions
    }

    getFileSystem(): BridgeFileSystem {
        return this.fileSystem
    }

    getLanguageService(): LanguageService {
        return this.languageService
    }

    getCurrentDirectory(): string {
        return this.currentDirectory
    }

    getSourceFile(filePath: string): SourceFile | undefined {
        return this.sourceFiles.get(normalizePath(filePath))
    }

    getSourceFileOrThrow(filePath: string): SourceFile {
        const sf = this.getSourceFile(filePath)
        if (!sf) throw new Error(`Source file not found: ${filePath}`)
        return sf
    }

    getSourceFiles(paths?: string[]): SourceFile[] {
        if (!paths || paths.length === 0) return [...this.sourceFiles.values()]
        const out: SourceFile[] = []
        const seen = new Set<string>()
        for (const p of paths) {
            const matched = p.includes("*") ? this.getSourceFilesByGlob(p) : [this.getSourceFile(p)].filter((sf) => sf != null)
            for (const sf of matched) {
                if (!seen.has(sf.getFilePath())) {
                    seen.add(sf.getFilePath())
                    out.push(sf)
                }
            }
        }
        return out
    }

    createSourceFile(filePath: string, text: string, opts: {overwrite?: boolean} = {}): SourceFile {
        const p = normalizePath(filePath)
        if (!opts.overwrite && this.sourceFiles.has(p)) throw new Error(`Source file already exists: ${filePath}`)
        this.files.set(p, text)
        this.bumpVersion(p)
        const sf = new SourceFile(this, p, text)
        this.sourceFiles.set(p, sf)
        return sf
    }

    addSourceFileAtPath(filePath: string): SourceFile {
        const p = normalizePath(filePath)
        return this.sourceFiles.get(p) ?? this.createSourceFile(p, this.readFileText(p), {overwrite: true})
    }

    getOrCreateSourceFile(filePath: string): SourceFile {
        const p = normalizePath(filePath)
        return this.sourceFiles.get(p) ?? this.createSourceFile(p, this.readFileText(p), {overwrite: true})
    }

    updateSourceFilePath(sf: SourceFile, newFilePath: string): void {
        const oldPath = sf.getFilePath()
        const newPath = normalizePath(newFilePath)
        this.sourceFiles.delete(oldPath)
        this.files.delete(oldPath)
        this.sourceFiles.set(newPath, sf)
        this.files.set(newPath, sf.getFullText())
        this.bumpVersion(newPath)
    }

    updateSourceFileText(filePath: string, text: string): void {
        const p = normalizePath(filePath)
        this.files.set(p, text)
        this.bumpVersion(p)
    }

    removeSourceFile(filePath: string): void {
        const p = normalizePath(filePath)
        this.sourceFiles.delete(p)
        this.files.delete(p)
        this.bumpVersion(p)
    }

    getScriptFileNames(): string[] {
        return [...this.sourceFiles.keys()]
    }

    getScriptVersion(filePath: string): string {
        return String(this.versions.get(normalizePath(filePath)) ?? 0)
    }

    readFileText(filePath: string): string {
        const p = normalizePath(filePath)
        const cached = this.files.get(p)
        if (cached != null) return cached
        if (this.inMemory) return ""
        return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""
    }

    fileExists(filePath: string): boolean {
        const p = normalizePath(filePath)
        return this.files.has(p) || (!this.inMemory && fs.existsSync(p))
    }

    resolveModuleSpecifier(from: SourceFile, specifier: string): SourceFile | undefined {
        const host: ts.ModuleResolutionHost = {
            fileExists: (fileName) => this.fileExists(fileName),
            readFile: (fileName) => this.readFileText(fileName),
        }
        const resolved = ts.resolveModuleName(specifier, from.getFilePath(), this.compilerOptions, host).resolvedModule
        return resolved ? this.getSourceFile(resolved.resolvedFileName) : undefined
    }

    private addDiskSourceFile(filePath: string): void {
        const p = normalizePath(filePath)
        if (this.sourceFiles.has(p)) return
        const text = this.readFileText(p)
        this.files.set(p, text)
        this.sourceFiles.set(p, new SourceFile(this, p, text))
    }

    private bumpVersion(filePath: string): void {
        const p = normalizePath(filePath)
        this.versions.set(p, (this.versions.get(p) ?? 0) + 1)
    }

    private getSourceFilesByGlob(glob: string): SourceFile[] {
        const re = globToRegExp(normalizePath(glob))
        return [...this.sourceFiles.values()].filter((sf) => re.test(sf.getFilePath()))
    }
}

function globToRegExp(glob: string): RegExp {
    let pattern = "^"
    for (let i = 0; i < glob.length;) {
        if (glob.startsWith("**/", i)) {
            pattern += "(?:.*/)?"
            i += 3
        } else if (glob.startsWith("**", i)) {
            pattern += ".*"
            i += 2
        } else if (glob[i] === "*") {
            pattern += "[^/]*"
            i++
        } else {
            pattern += escapeRegExp(glob[i])
            i++
        }
    }
    return new RegExp(pattern + "$")
}

function escapeRegExp(text: string): string {
    return text.replace(/[\\^$+?.()|[\]{}]/g, "\\$&")
}

// Loads tsconfig through TypeScript's own parser so file lists and compiler
// defaults follow tsc rather than a local glob approximation.
function readTsConfig(tsConfigFilePath: string, skipLoadingLibFiles: boolean): ts.ParsedCommandLine {
    const configPath = normalizePath(tsConfigFilePath)
    const read = ts.readConfigFile(configPath, ts.sys.readFile)
    if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"))
    const host = skipLoadingLibFiles
        ? {
            ...ts.sys,
            readDirectory: (rootDir: string, extensions: readonly string[], excludes: readonly string[] | undefined, includes: readonly string[] | undefined, depth?: number) =>
                ts.sys.readDirectory(rootDir, extensions, excludes, includes, depth).filter((file) => !normalizePath(file).includes("/node_modules/typescript/lib/")),
        }
        : ts.sys
    return ts.parseJsonConfigFileContent(read.config, host, path.dirname(configPath), undefined, configPath)
}

// SourceFile: a tracked file in a Project. It owns the live text plus a freshly
// parsed standalone AST used for all syntactic navigation and the format passes;
// the tree is reparsed only when the text changes. Semantic operations
// (exported declarations, referencing files, organize-imports, formatting) are
// delegated to the project's language service and mapped back onto this tree.

import type {TSR} from "ts-refine"
import ts from "typescript"
import type {CallExpression, ClassDeclaration, EnumDeclaration, ExportDeclaration, FunctionDeclaration, ImportDeclaration, InterfaceDeclaration, ModuleDeclaration, Node, TypeAliasDeclaration, VariableStatement} from "./node.ts"
import {createWrapper, locateByPos, resolvePath} from "./node.ts"
import {baseNameOf, dirOf, normalizePath} from "./paths.ts"
import type {Project} from "./project.ts"

// ScriptKind decides the grammar (notably TSX vs TS), so it is derived from the
// extension up front and kept stable across edits.
function scriptKindForPath(filePath: string): ts.ScriptKind {
    if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX
    if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX
    if (filePath.endsWith(".json")) return ts.ScriptKind.JSON
    if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) return ts.ScriptKind.JS
    return ts.ScriptKind.TS
}

export class SourceFile implements TSR.SourceFile {
    private readonly project: Project
    private filePath: string
    private text: string
    // Not readonly: a move can change the extension, which changes the grammar.
    private scriptKind: ts.ScriptKind
    private tsSourceFile: ts.SourceFile
    // Bumped on each edit; wrappers compare against it to revalidate lazily.
    scriptVersion = 0

    // `preParsed` lets a read-only foreign file (an external declaration reached
    // via a re-export) reuse the program's already-parsed tree instead of
    // re-parsing megabytes of .d.ts that the caller will then discard.
    constructor(project: Project, filePath: string, text: string, preParsed?: ts.SourceFile) {
        this.project = project
        this.filePath = filePath
        this.text = preParsed != null ? preParsed.text : text
        this.scriptKind = scriptKindForPath(filePath)
        this.tsSourceFile = preParsed ?? this.parse()
    }

    private parse(): ts.SourceFile {
        return ts.createSourceFile(this.filePath, this.text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, this.scriptKind)
    }

    get compilerNode(): ts.SourceFile {
        return this.tsSourceFile
    }

    getProject(): Project {
        return this.project
    }

    getFilePath(): string {
        return this.filePath
    }

    // Project-internal: used by a move to repath the wrapper in place. The
    // repath replaces the parsed tree (and may change the grammar via a new
    // extension), so it is treated like an edit: refresh the script kind, bump
    // the version, and drop the wrapper cache so captured wrappers revalidate
    // against the new tree rather than a stale node.
    setFilePath(filePath: string): void {
        this.filePath = filePath
        this.scriptKind = scriptKindForPath(filePath)
        this.tsSourceFile = this.parse()
        this.scriptVersion++
        this.wrapperCache = new WeakMap()
    }

    getDirectoryPath(): string {
        return dirOf(this.filePath)
    }

    getBaseName(): string {
        return baseNameOf(this.filePath)
    }

    // Concise inspector: a SourceFile reaches the whole project, so let
    // util.inspect print just the path rather than the entire graph.
    [globalThis.Symbol.for("nodejs.util.inspect.custom")](): string {
        return `SourceFile<${this.filePath}>`
    }

    getFullText(): string {
        return this.text
    }

    getText(): string {
        return this.text
    }

    getScriptKind(): ts.ScriptKind {
        return this.scriptKind
    }

    isFromExternalLibrary(): boolean {
        // A node_modules path is external even when added explicitly as a root
        // (the program only flags files it pulled in via resolution).
        if (/[/\\]node_modules[/\\]/.test(this.filePath)) return true
        // Don't build the program just to answer this: a purely syntactic report
        // (function-spacing, member-delimiter, …) filters the project's own files
        // and never needs it. When a semantic operation has already built the
        // program, use its accurate external-library flag.
        if (!this.project.hasProgram()) return false
        const program = this.project.getTsProgram()
        const node = program.getSourceFile(this.filePath)
        return node != null && program.isSourceFileFromExternalLibrary(node)
    }

    // --- mutation --------------------------------------------------------------

    replaceWithText(text: string): void {
        if (text === this.text) return
        this.text = text
        this.tsSourceFile = this.parse()
        this.scriptVersion++
        this.project.bumpVersion()
    }

    applyTextChanges(changes: readonly ts.TextChange[]): void {
        if (changes.length === 0) return
        // Apply last-to-first so earlier spans keep their offsets.
        const ordered = [...changes].sort((a, b) => b.span.start - a.span.start)
        let result = this.text
        for (const c of ordered) {
            result = result.slice(0, c.span.start) + c.newText + result.slice(c.span.start + c.span.length)
        }
        this.replaceWithText(result)
    }

    async save(): Promise<void> {
        await this.project.getFileSystem().writeFile(this.filePath, this.text)
    }

    // No persistent wrapper cache is held (wrappers revalidate lazily), so the
    // structural-reparse hint the format pass calls is a no-op here.
    forgetDescendants(): void {}

    // --- language-service backed edits ----------------------------------------

    formatText(settings: ts.FormatCodeSettings): void {
        const merged = this.project.mergeFormatSettings(settings)
        const edits = this.project.getTsLanguageService().getFormattingEditsForDocument(this.filePath, merged)
        this.applyTextChanges(edits)
    }

    organizeImports(settings: ts.FormatCodeSettings): void {
        const merged = this.project.mergeFormatSettings(settings)
        const changes = this.project.getTsLanguageService().organizeImports({type: "file", fileName: this.filePath}, merged, {})
        this.project.applyFileTextChanges(changes)
    }

    // Relocate this file and update every module specifier that targets it (and
    // its own outgoing relative specifiers). The language service computes the
    // path arithmetic for all import forms; we then re-key the file. The wrapper
    // identity is preserved so references captured before the move stay valid.
    move(newPath: string): void {
        const norm = normalizePath(newPath)
        const edits = this.project.getTsLanguageService().getEditsForFileRename(this.filePath, norm, {}, {})
        this.project.applyFileTextChanges(edits)
        this.project.repathSourceFile(this, norm)
    }

    // --- navigation ------------------------------------------------------------

    // Within one edit-free pass, repeated wraps of the same node — including a
    // program node mapped back through locateByPos — return one wrapper, so the
    // identity dedup the target walk relies on (`includes(node)`) holds. The
    // cache is keyed on the reparsed node, so an edit starts a fresh generation;
    // that is fine because callers re-fetch wrappers after editing rather than
    // comparing a pre-edit wrapper against a post-edit one. A wrapper captured
    // across an edit stays usable via its own path-based revalidation.
    private wrapperCache = new WeakMap<ts.Node, Node>()

    wrap(tsNode: ts.Node): Node {
        const path = locateByPos(this.tsSourceFile, tsNode)
        return this.wrapByPath(path, resolvePath(this.tsSourceFile, path))
    }

    // Wrap a node whose forEachChild index path from the root is already known —
    // navigation uses this to avoid re-locating from the root. `tsNode` must be
    // the node `path` resolves to in the current tree.
    wrapByPath(path: number[], tsNode: ts.Node): Node {
        const cached = this.wrapperCache.get(tsNode)
        if (cached != null) return cached
        const wrapper = createWrapper(this, path, tsNode)
        this.wrapperCache.set(tsNode, wrapper)
        return wrapper
    }

    private statementsOfKind(kind: ts.SyntaxKind): Node[] {
        const out: Node[] = []
        for (const stmt of this.tsSourceFile.statements) {
            if (stmt.kind === kind) out.push(this.wrap(stmt))
        }
        return out
    }

    getStatements(): Node[] {
        return this.tsSourceFile.statements.map((s) => this.wrap(s))
    }

    getImportDeclarations(): ImportDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.ImportDeclaration) as ImportDeclaration[]
    }

    getExportDeclarations(): ExportDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.ExportDeclaration) as ExportDeclaration[]
    }

    getInterfaces(): InterfaceDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.InterfaceDeclaration) as InterfaceDeclaration[]
    }

    getClasses(): ClassDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.ClassDeclaration) as ClassDeclaration[]
    }

    getFunctions(): FunctionDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.FunctionDeclaration) as FunctionDeclaration[]
    }

    getEnums(): EnumDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.EnumDeclaration) as EnumDeclaration[]
    }

    getTypeAliases(): TypeAliasDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.TypeAliasDeclaration) as TypeAliasDeclaration[]
    }

    getModules(): ModuleDeclaration[] {
        return this.statementsOfKind(ts.SyntaxKind.ModuleDeclaration) as ModuleDeclaration[]
    }

    getVariableStatements(): VariableStatement[] {
        return this.statementsOfKind(ts.SyntaxKind.VariableStatement) as VariableStatement[]
    }

    // CallExpression is the only kind the library walks; the typed overload
    // keeps its `getExpression()` / `getArguments()` call sites well-typed.
    getDescendantsOfKind(kind: ts.SyntaxKind.CallExpression): CallExpression[]
    getDescendantsOfKind(kind: ts.SyntaxKind): Node[]
    getDescendantsOfKind(kind: ts.SyntaxKind): Node[] {
        const out: Node[] = []
        const walk = (node: ts.Node, path: number[]): void => {
            let i = 0
            ts.forEachChild(node, (child) => {
                const childPath = [...path, i]
                i++
                if (child.kind === kind) out.push(createWrapper(this, childPath, child))
                walk(child, childPath)
            })
        }
        walk(this.tsSourceFile, [])
        return out
    }

    // The deepest node that begins exactly at `start` and spans `width`. The
    // member-delimiter pass re-wraps a compiler-AST container this way, and
    // reference mapping resolves an identifier at a span.
    //
    // Descend by position rather than walking the whole tree: at each level step
    // into the single child whose full-width range contains the target span,
    // recording every exact start/end match so the deepest one wins. This is
    // O(depth) instead of O(nodes), which matters because callers invoke it once
    // per container.
    getDescendantAtStartWithWidth(start: number, width: number): Node | undefined {
        const end = start + width
        let node: ts.Node = this.tsSourceFile
        let found: ts.Node | undefined
        for (; ;) {
            if (node.getStart(this.tsSourceFile) === start && node.end === end) found = node
            let next: ts.Node | undefined
            ts.forEachChild(node, (child) => {
                if (child.pos <= start && end <= child.end) {
                    next = child
                    return true
                }
                return undefined
            })
            if (next == null) break
            node = next
        }
        return found != null ? this.wrap(found) : undefined
    }

    // --- semantic queries ------------------------------------------------------

    // Map of exported name → declaration nodes, following re-export aliases to
    // their original declarations (which may live in other files). Mirrors the
    // grouping callers iterate to count and locate exports.
    getExportedDeclarations(): Map<string, Node[]> {
        const checker = this.project.getTypeChecker()
        const programSf = this.project.getTsProgram().getSourceFile(this.filePath)
        const result = new Map<string, Node[]>()
        const moduleSymbol = programSf != null ? checker.getSymbolAtLocation(programSf) : undefined
        if (moduleSymbol == null) return result

        for (const exp of checker.getExportsOfModule(moduleSymbol)) {
            const target = (exp.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exp) : exp
            const decls = target.getDeclarations() ?? []
            const nodes: Node[] = []
            for (const decl of decls) nodes.push(this.project.wrapProgramNode(decl))
            if (nodes.length > 0) result.set(exp.name, nodes)
        }
        return result
    }

    // In-project files that import / re-export / dynamically import this one.
    getReferencingSourceFiles(): SourceFile[] {
        const out: SourceFile[] = []
        for (const sf of this.project.getSourceFiles()) {
            if (sf === this) continue
            if (sf.referencesFile(this.filePath)) out.push(sf)
        }
        return out
    }

    // Whether any module specifier in this file resolves to `targetPath`.
    referencesFile(targetPath: string): boolean {
        let hit = false
        const visit = (node: ts.Node): void => {
            if (hit) return
            const specifier = staticModuleSpecifier(node) ?? dynamicModuleSpecifier(node) ?? importEqualsSpecifier(node) ?? importTypeSpecifier(node)
            if (specifier != null) {
                const resolved = this.project.resolveModuleSpecifier(this.filePath, specifier)
                if (resolved?.getFilePath() === targetPath) {
                    hit = true
                    return
                }
            }
            ts.forEachChild(node, visit)
        }
        visit(this.tsSourceFile)
        return hit
    }

    getLineAndColumnAtPos(pos: number): {line: number; column: number} {
        const lc = this.tsSourceFile.getLineAndCharacterOfPosition(pos)
        return {line: lc.line + 1, column: lc.character + 1}
    }
}

// The literal text of an import/export declaration's module specifier, or
// undefined for declarations without one (a local `export {}`).
function staticModuleSpecifier(node: ts.Node): string | undefined {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier != null && ts.isStringLiteral(node.moduleSpecifier)) {
        return node.moduleSpecifier.text
    }
    return undefined
}

// The literal argument of a dynamic `import("...")` call, or undefined.
function dynamicModuleSpecifier(node: ts.Node): string | undefined {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0]
        if (arg != null && ts.isStringLiteral(arg)) return arg.text
    }
    return undefined
}

// The module of an `import x = require("...")`, or undefined.
function importEqualsSpecifier(node: ts.Node): string | undefined {
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
        return node.moduleReference.expression.text
    }
    return undefined
}

// The module of an `import("...")` type node (`type T = import("...").X`), or
// undefined.
function importTypeSpecifier(node: ts.Node): string | undefined {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        return node.argument.literal.text
    }
    return undefined
}

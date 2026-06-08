// Node wrappers over the standalone syntactic tree, plus the `Node` namespace of
// type guards. A wrapper does not hold its compiler node directly: it stores a
// path of child indices from the source-file root and re-resolves lazily after
// an edit reparses the tree. That keeps a reference captured before a
// non-structural edit (a module-specifier or identifier rewrite, as move/rename
// perform) valid afterwards, without reproducing a full incremental model.
//
// Tokens are not reachable through forEachChild, so the few token references the
// library takes (a statement's trailing `;`) are pinned to the current version
// instead and used immediately.

import ts from "typescript"
import type {SourceFile} from "./source-file.ts"
import type {Symbol as TsSymbol} from "./symbol.ts"

// util.inspect hook key, resolved via globalThis so files that shadow the
// global Symbol (symbol.ts) can share the same approach.
const INSPECT = globalThis.Symbol.for("nodejs.util.inspect.custom")

// Walk forEachChild children by index to resolve a stored path back to a node.
function childAt(node: ts.Node, index: number): ts.Node | undefined {
    let i = 0
    let result: ts.Node | undefined
    ts.forEachChild(node, (child) => {
        if (i++ === index) {
            result = child
            return true
        }
        return undefined
    })
    return result
}

export function resolvePath(root: ts.Node, path: number[]): ts.Node {
    let node = root
    for (const index of path) {
        const child = childAt(node, index)
        if (child == null) throw new Error("refine: node is no longer present after an edit")
        node = child
    }
    return node
}

// The forEachChild index path from `root` to `target`. Works across two trees
// parsed from identical text (a program node located in the standalone tree):
// descent is by full-width position containment and stops on an exact
// position+kind match rather than object identity.
export function locateByPos(root: ts.SourceFile, target: ts.Node): number[] {
    const path: number[] = []
    let node: ts.Node = root
    while (!(node.pos === target.pos && node.end === target.end && node.kind === target.kind)) {
        let idx = 0
        let i = 0
        let next: ts.Node | undefined
        ts.forEachChild(node, (child) => {
            if (child.pos <= target.pos && target.end <= child.end) {
                idx = i
                next = child
                return true
            }
            i++
            return undefined
        })
        if (next == null) throw new Error("refine: cannot locate node in source tree")
        path.push(idx)
        node = next
    }
    return path
}

export class Node {
    readonly sourceFile: SourceFile
    // null path marks a pinned wrapper (a token); it never revalidates.
    private readonly path: number[] | null
    private cachedNode: ts.Node
    private cachedVersion: number

    constructor(sourceFile: SourceFile, path: number[] | null, tsNode: ts.Node) {
        this.sourceFile = sourceFile
        this.path = path
        this.cachedNode = tsNode
        this.cachedVersion = sourceFile.scriptVersion
    }

    get compilerNode(): ts.Node {
        if (this.cachedVersion === this.sourceFile.scriptVersion) return this.cachedNode
        if (this.path == null) throw new Error("refine: stale token reference used after an edit")
        this.cachedNode = resolvePath(this.sourceFile.compilerNode, this.path)
        this.cachedVersion = this.sourceFile.scriptVersion
        return this.cachedNode
    }

    protected get root(): ts.SourceFile {
        return this.sourceFile.compilerNode
    }

    // Wrap a node reached from this one. A direct forEachChild child is wrapped
    // from this node's path plus the child index — O(this node's children) — so
    // navigation never re-locates from the root. Anything else (a deeper node,
    // or a pinned wrapper) falls back to a root-relative locate.
    protected wrapChild(tsNode: ts.Node): Node {
        if (this.path != null) {
            let index = -1
            let i = 0
            ts.forEachChild(this.compilerNode, (child) => {
                if (child === tsNode) {
                    index = i
                    return true
                }
                i++
                return undefined
            })
            if (index >= 0) return this.sourceFile.wrapByPath([...this.path, index], tsNode)
        }
        return this.sourceFile.wrap(tsNode)
    }

    getKind(): ts.SyntaxKind {
        return this.compilerNode.kind
    }

    getKindName(): string {
        return ts.SyntaxKind[this.compilerNode.kind]
    }

    getText(): string {
        return this.compilerNode.getText(this.root)
    }

    getFullText(): string {
        return this.compilerNode.getFullText(this.root)
    }

    getStart(): number {
        return this.compilerNode.getStart(this.root)
    }

    getEnd(): number {
        return this.compilerNode.end
    }

    getWidth(): number {
        return this.compilerNode.getWidth(this.root)
    }

    getSourceFile(): SourceFile {
        return this.sourceFile
    }

    // A wrapper transitively references the whole project; without a concise
    // inspector, util.inspect (e.g. an assertion-failure diff) would walk the
    // entire type graph and exhaust memory.
    [INSPECT](): string {
        let snippet = ""
        try {
            const text = this.getText()
            snippet = text.length > 40 ? text.slice(0, 40) + "…" : text
        } catch {
            snippet = "<detached>"
        }
        return `${this.constructor.name}<${this.getKindName()}> ${JSON.stringify(snippet)}`
    }

    // The declaration name node, when this node carries an identifier-like
    // `name`. Present on every node (returning undefined when absent) so the
    // `"getNameNode" in decl` probes resolve uniformly; callers narrow with
    // Node.isIdentifier.
    getNameNode(): Node | undefined {
        const name = (this.compilerNode as {name?: ts.Node}).name
        return name != null ? this.wrapChild(name) : undefined
    }

    // Last child including tokens (forEachChild skips tokens, getChildren does
    // not). Pinned to the current version since the result is used at once.
    getLastChild(): Node | undefined {
        const children = this.compilerNode.getChildren(this.root)
        const last = children[children.length - 1]
        return last != null ? new Node(this.sourceFile, null, last) : undefined
    }

    // The executable body of a body-bearing node, or undefined. Every node
    // answers it (returning undefined when absent) so the member-delimiter
    // pass's `"getBody" in member` probe behaves like ts-morph's: a member with
    // a body is not separator-bearing, one without still is.
    getBody(): Node | undefined {
        const body = (this.compilerNode as {body?: ts.Node}).body
        return body != null ? this.wrapChild(body) : undefined
    }

    // Trailing comments after this node, exposed only for their kind.
    getTrailingCommentRanges(): {getKind(): ts.SyntaxKind}[] {
        const ranges = ts.getTrailingCommentRanges(this.root.text, this.getEnd())
        return (ranges ?? []).map((r) => ({getKind: () => r.kind}))
    }

    replaceWithText(text: string): void {
        const full = this.sourceFile.getFullText()
        this.sourceFile.replaceWithText(full.slice(0, this.getStart()) + text + full.slice(this.getEnd()))
    }

    getSymbol(): TsSymbol | undefined {
        const project = this.sourceFile.getProject()
        const programNode = project.toProgramNode(this.sourceFile, this.compilerNode)
        if (programNode == null) return undefined
        // Declarations carry the binder's symbol directly; references resolve
        // through the checker. getSymbolAtLocation alone misses the former.
        const symbol = (programNode as {symbol?: ts.Symbol}).symbol ?? project.getTypeChecker().getSymbolAtLocation(programNode)
        return symbol != null ? project.wrapSymbol(symbol) : undefined
    }

    // Reference locations for this node (declaration, importer bindings, usages)
    // as wrapped identifier nodes, via the language service.
    findReferencesAsNodes(): Node[] {
        const project = this.sourceFile.getProject()
        const found = project.getTsLanguageService().findReferences(this.sourceFile.getFilePath(), this.getStart())
        const out: Node[] = []
        if (found == null) return out
        for (const symbol of found) {
            for (const ref of symbol.references) {
                const node = project.wrapReferenceLocation(ref.fileName, ref.textSpan.start, ref.textSpan.length)
                if (node != null) out.push(node)
            }
        }
        return out
    }

    // RenameableNode: rename every reference through the language service.
    // providePrefixAndSuffixTextForRename is on so a shorthand that would change
    // meaning is rewritten with an explicit `name:`/`: name` instead of a bare
    // identifier (the prefix/suffix text applied below).
    rename(newName: string): void {
        const project = this.sourceFile.getProject()
        const locations = project.getTsLanguageService().findRenameLocations(this.sourceFile.getFilePath(), this.getStart(), false, false, true)
        if (locations == null) return
        const byFile = new Map<string, ts.RenameLocation[]>()
        for (const loc of locations) {
            const list = byFile.get(loc.fileName)
            if (list != null) list.push(loc)
            else byFile.set(loc.fileName, [loc])
        }
        for (const [fileName, locs] of byFile) {
            const sf = project.getSourceFile(fileName)
            if (sf == null) continue
            sf.applyTextChanges(locs.map((l) => ({span: l.textSpan, newText: (l.prefixText ?? "") + newName + (l.suffixText ?? "")})))
        }
    }

    // --- static type guards ----------------------------------------------------

    static isIdentifier(node: Node | undefined): node is Identifier {
        return node?.getKind() === ts.SyntaxKind.Identifier
    }
    static isStringLiteral(node: Node | undefined): node is StringLiteral {
        return node?.getKind() === ts.SyntaxKind.StringLiteral
    }
    static isNamespaceImport(node: Node | undefined): node is NamespaceImport {
        return node?.getKind() === ts.SyntaxKind.NamespaceImport
    }
    static isNamedImports(node: Node | undefined): node is NamedImports {
        return node?.getKind() === ts.SyntaxKind.NamedImports
    }
    static isImportDeclaration(node: Node | undefined): node is ImportDeclaration {
        return node?.getKind() === ts.SyntaxKind.ImportDeclaration
    }
    static isExportDeclaration(node: Node | undefined): node is ExportDeclaration {
        return node?.getKind() === ts.SyntaxKind.ExportDeclaration
    }
    static isFunctionDeclaration(node: Node | undefined): node is FunctionDeclaration {
        return node?.getKind() === ts.SyntaxKind.FunctionDeclaration
    }
    static isClassDeclaration(node: Node | undefined): node is ClassDeclaration {
        return node?.getKind() === ts.SyntaxKind.ClassDeclaration
    }
    static isInterfaceDeclaration(node: Node | undefined): node is InterfaceDeclaration {
        return node?.getKind() === ts.SyntaxKind.InterfaceDeclaration
    }
    static isTypeAliasDeclaration(node: Node | undefined): node is TypeAliasDeclaration {
        return node?.getKind() === ts.SyntaxKind.TypeAliasDeclaration
    }
    static isEnumDeclaration(node: Node | undefined): node is EnumDeclaration {
        return node?.getKind() === ts.SyntaxKind.EnumDeclaration
    }
    static isModuleDeclaration(node: Node | undefined): node is ModuleDeclaration {
        return node?.getKind() === ts.SyntaxKind.ModuleDeclaration
    }
    static isVariableDeclaration(node: Node | undefined): node is VariableDeclaration {
        return node?.getKind() === ts.SyntaxKind.VariableDeclaration
    }
    static isClassStaticBlockDeclaration(node: Node | undefined): boolean {
        return node?.getKind() === ts.SyntaxKind.ClassStaticBlockDeclaration
    }

    // Whether find-references can anchor on this node: an identifier, or a
    // declaration carrying an identifier name.
    static isReferenceFindable(node: Node | undefined): boolean {
        if (node == null) return false
        if (node.getKind() === ts.SyntaxKind.Identifier) return true
        const name = (node.compilerNode as {name?: ts.Node}).name
        return name != null && name.kind === ts.SyntaxKind.Identifier
    }
}

// --- typed wrappers ------------------------------------------------------------

export class Identifier extends Node {}

export class StringLiteral extends Node {
    getLiteralValue(): string {
        return (this.compilerNode as ts.StringLiteral).text
    }
    setLiteralValue(text: string): void {
        replaceStringLiteral(this, this.compilerNode as ts.StringLiteral, text)
    }
}

export class ImportDeclaration extends Node {
    private get node(): ts.ImportDeclaration {
        return this.compilerNode as ts.ImportDeclaration
    }
    getImportClause(): ImportClause | undefined {
        const clause = this.node.importClause
        return clause != null ? (this.wrapChild(clause) as ImportClause) : undefined
    }
    isTypeOnly(): boolean {
        return this.node.importClause?.isTypeOnly ?? false
    }
    getModuleSpecifierValue(): string {
        return (this.node.moduleSpecifier as ts.StringLiteral).text
    }
    getModuleSpecifierSourceFile(): SourceFile | undefined {
        return this.sourceFile.getProject().resolveModuleSpecifier(this.sourceFile.getFilePath(), this.getModuleSpecifierValue())
    }
    setModuleSpecifier(text: string): void {
        replaceStringLiteral(this, this.node.moduleSpecifier as ts.StringLiteral, text)
    }
    getDefaultImport(): Identifier | undefined {
        const name = this.node.importClause?.name
        return name != null ? (this.wrapChild(name) as Identifier) : undefined
    }
    getNamespaceImport(): Identifier | undefined {
        const bindings = this.node.importClause?.namedBindings
        return bindings != null && ts.isNamespaceImport(bindings) ? (this.wrapChild(bindings.name) as Identifier) : undefined
    }
    getNamedImports(): ImportSpecifier[] {
        const bindings = this.node.importClause?.namedBindings
        if (bindings == null || !ts.isNamedImports(bindings)) return []
        return bindings.elements.map((e) => this.wrapChild(e) as ImportSpecifier)
    }
}

export class ImportClause extends Node {
    private get node(): ts.ImportClause {
        return this.compilerNode as ts.ImportClause
    }
    getDefaultImport(): Identifier | undefined {
        return this.node.name != null ? (this.wrapChild(this.node.name) as Identifier) : undefined
    }
    getNamedBindings(): Node | undefined {
        return this.node.namedBindings != null ? this.wrapChild(this.node.namedBindings) : undefined
    }
}

export class NamespaceImport extends Node {
    getNameNode(): Identifier {
        return this.wrapChild((this.compilerNode as ts.NamespaceImport).name) as Identifier
    }
}

export class NamedImports extends Node {
    getElements(): ImportSpecifier[] {
        return (this.compilerNode as ts.NamedImports).elements.map((e) => this.wrapChild(e) as ImportSpecifier)
    }
}

export class ImportSpecifier extends Node {
    private get node(): ts.ImportSpecifier {
        return this.compilerNode as ts.ImportSpecifier
    }
    isTypeOnly(): boolean {
        return this.node.isTypeOnly
    }
    // The imported (module-side) name: the property name when aliased.
    getName(): string {
        return (this.node.propertyName ?? this.node.name).text
    }
    // The module-side name node (property name when aliased, else the binding).
    getNameNode(): Identifier {
        return this.wrapChild(this.node.propertyName ?? this.node.name) as Identifier
    }
    // The local binding node when the specifier is aliased (`a as b` → b).
    getAliasNode(): Identifier | undefined {
        return this.node.propertyName != null ? (this.wrapChild(this.node.name) as Identifier) : undefined
    }
}

export class ExportSpecifier extends Node {
    getName(): string {
        const node = this.compilerNode as ts.ExportSpecifier
        return (node.propertyName ?? node.name).text
    }
}

export class NamespaceExport extends Node {
    getName(): string {
        return (this.compilerNode as ts.NamespaceExport).name.text
    }
}

export class ExportDeclaration extends Node {
    private get node(): ts.ExportDeclaration {
        return this.compilerNode as ts.ExportDeclaration
    }
    getModuleSpecifierValue(): string | undefined {
        const spec = this.node.moduleSpecifier
        return spec != null && ts.isStringLiteral(spec) ? spec.text : undefined
    }
    getModuleSpecifierSourceFile(): SourceFile | undefined {
        const value = this.getModuleSpecifierValue()
        return value != null ? this.sourceFile.getProject().resolveModuleSpecifier(this.sourceFile.getFilePath(), value) : undefined
    }
    setModuleSpecifier(text: string): void {
        replaceStringLiteral(this, this.node.moduleSpecifier as ts.StringLiteral, text)
    }
    getNamespaceExport(): NamespaceExport | undefined {
        const clause = this.node.exportClause
        return clause != null && ts.isNamespaceExport(clause) ? (this.wrapChild(clause) as NamespaceExport) : undefined
    }
    getNamedExports(): ExportSpecifier[] {
        const clause = this.node.exportClause
        if (clause == null || !ts.isNamedExports(clause)) return []
        return clause.elements.map((e) => this.wrapChild(e) as ExportSpecifier)
    }
}

export class CallExpression extends Node {
    getExpression(): Node {
        return this.wrapChild((this.compilerNode as ts.CallExpression).expression)
    }
    getArguments(): Node[] {
        return (this.compilerNode as ts.CallExpression).arguments.map((a) => this.wrapChild(a))
    }
}

// Declarations that expose a name. The name node accessor is inherited from
// Node; this adds the string form callers compare against.
class NamedDeclaration extends Node {
    getName(): string | undefined {
        const name = (this.compilerNode as {name?: ts.Node}).name
        return name != null ? name.getText(this.root) : undefined
    }
}

export class FunctionDeclaration extends NamedDeclaration {}
export class TypeAliasDeclaration extends NamedDeclaration {}
export class EnumDeclaration extends NamedDeclaration {}
export class ModuleDeclaration extends NamedDeclaration {}

class MemberedDeclaration extends NamedDeclaration {
    getMembers(): Node[] {
        const node = this.compilerNode as ts.ClassDeclaration | ts.InterfaceDeclaration
        return node.members.map((m) => this.wrapChild(m))
    }
}

export class ClassDeclaration extends MemberedDeclaration {}
export class InterfaceDeclaration extends MemberedDeclaration {}

export class VariableDeclaration extends NamedDeclaration {
    getName(): string {
        return (this.compilerNode as ts.VariableDeclaration).name.getText(this.root)
    }
    getVariableStatement(): VariableStatement | undefined {
        const list = this.compilerNode.parent
        const stmt = list?.parent
        return stmt != null && ts.isVariableStatement(stmt) ? (this.wrapChild(stmt) as VariableStatement) : undefined
    }
}

export class VariableStatement extends Node {
    getDeclarations(): VariableDeclaration[] {
        return (this.compilerNode as ts.VariableStatement).declarationList.declarations.map((d) => this.wrapChild(d) as VariableDeclaration)
    }
    // "const" / "let" / "var" — matches the string form callers expect.
    getDeclarationKind(): string {
        const flags = (this.compilerNode as ts.VariableStatement).declarationList.flags
        if ((flags & ts.NodeFlags.Const) !== 0) return "const"
        if ((flags & ts.NodeFlags.Let) !== 0) return "let"
        return "var"
    }
}

// Replace a string literal's content in place, preserving its quote character.
function replaceStringLiteral(owner: Node, literal: ts.StringLiteral, newInner: string): void {
    const sf = owner.sourceFile
    const full = sf.getFullText()
    const start = literal.getStart(sf.compilerNode)
    const end = literal.end
    const quote = full[start] === "'" ? "'" : full[start] === "`" ? "`" : '"'
    sf.replaceWithText(full.slice(0, start) + quote + escapeForQuote(newInner, quote) + quote + full.slice(end))
}

// Escape a literal's decoded content for the chosen delimiter. `newInner` comes
// from `literal.text` (already decoded), so a path containing the quote (a dir
// named `bob's`) or a backslash would otherwise produce invalid source.
function escapeForQuote(text: string, quote: string): string {
    let out = text.replace(/\\/g, "\\\\").replaceAll(quote, "\\" + quote).replace(/\r/g, "\\r").replace(/\n/g, "\\n")
    if (quote === "`") out = out.replace(/\$\{/g, "\\${")
    return out
}

// Map a syntax kind to its wrapper constructor; unmapped kinds fall back to the
// base Node so every node still answers the shared accessors.
const WRAPPERS = new Map<ts.SyntaxKind, new (sf: SourceFile, path: number[] | null, n: ts.Node) => Node>([
    [ts.SyntaxKind.Identifier, Identifier],
    [ts.SyntaxKind.StringLiteral, StringLiteral],
    [ts.SyntaxKind.ImportDeclaration, ImportDeclaration],
    [ts.SyntaxKind.ImportClause, ImportClause],
    [ts.SyntaxKind.NamespaceImport, NamespaceImport],
    [ts.SyntaxKind.NamedImports, NamedImports],
    [ts.SyntaxKind.ImportSpecifier, ImportSpecifier],
    [ts.SyntaxKind.ExportDeclaration, ExportDeclaration],
    [ts.SyntaxKind.ExportSpecifier, ExportSpecifier],
    [ts.SyntaxKind.NamespaceExport, NamespaceExport],
    [ts.SyntaxKind.CallExpression, CallExpression],
    [ts.SyntaxKind.FunctionDeclaration, FunctionDeclaration],
    [ts.SyntaxKind.ClassDeclaration, ClassDeclaration],
    [ts.SyntaxKind.InterfaceDeclaration, InterfaceDeclaration],
    [ts.SyntaxKind.TypeAliasDeclaration, TypeAliasDeclaration],
    [ts.SyntaxKind.EnumDeclaration, EnumDeclaration],
    [ts.SyntaxKind.ModuleDeclaration, ModuleDeclaration],
    [ts.SyntaxKind.VariableStatement, VariableStatement],
    [ts.SyntaxKind.VariableDeclaration, VariableDeclaration],
])

export function createWrapper(sourceFile: SourceFile, path: number[], tsNode: ts.Node): Node {
    const ctor = WRAPPERS.get(tsNode.kind) ?? Node
    return new ctor(sourceFile, path, tsNode)
}

// Type aliases the format/report passes import for member typing. The bridge
// exposes a single member type for both class and interface members.
export type ClassMemberTypes = Node
export type TypeElementTypes = Node

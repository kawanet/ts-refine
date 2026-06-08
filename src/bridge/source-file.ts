import path from "node:path"
import type {TSR} from "ts-refine"
import * as ts from "typescript"
import {normalizePath} from "./file-system.ts"
import {Node} from "./node.ts"
import type {Project} from "./project.ts"
import {applyTextChanges} from "./text-change.ts"

// SourceFile stores the mutable text for one project file and reparses it after
// edits. The bridge avoids preserving stale child-node wrappers across edits;
// callers should reacquire nodes from the file after mutating it.
export class SourceFile implements TSR.SourceFile {
    compilerNode: ts.SourceFile
    private readonly project: Project
    private filePath: string
    private text: string

    constructor(project: Project, filePath: string, text: string) {
        this.project = project
        this.filePath = filePath
        this.text = text
        this.compilerNode = parse(filePath, text)
    }

    getProject(): Project {
        return this.project
    }

    getFilePath(): string {
        return this.filePath
    }

    getDirectoryPath(): string {
        return path.dirname(this.filePath)
    }

    getBaseName(): string {
        return path.basename(this.filePath)
    }

    getFullText(): string {
        return this.text
    }

    getText(): string {
        return this.text
    }

    getScriptKind(): ts.ScriptKind {
        return scriptKindFromPath(this.filePath)
    }

    isFromExternalLibrary(): boolean {
        return this.filePath.includes("/node_modules/")
    }

    replaceWithText(text: string): this {
        this.setText(text)
        return this
    }

    replaceText(range: [number, number], text: string): this {
        this.setText(this.text.slice(0, range[0]) + text + this.text.slice(range[1]))
        return this
    }

    applyTextChanges(changes: readonly ts.TextChange[]): this {
        this.setText(applyTextChanges(this.text, changes))
        return this
    }

    forgetDescendants(): void {
        // Child wrappers are intentionally ephemeral in the bridge.
    }

    formatText(settings: ts.FormatCodeSettings): void {
        this.applyTextChanges(this.project.getLanguageService().getFormattingEditsForDocument(this, settings))
    }

    organizeImports(settings: ts.FormatCodeSettings): void {
        for (const change of this.project.getLanguageService().organizeImports(this, settings)) change.applyChanges()
    }

    async save(): Promise<void> {
        this.project.getFileSystem().writeFileSync(this.filePath, this.text)
    }

    move(filePath: string): this {
        const oldPath = this.filePath
        const nextPath = normalizePath(path.isAbsolute(filePath) ? filePath : path.resolve(this.getDirectoryPath(), filePath))
        for (const change of this.project.getLanguageService().getEditsForFileRename(oldPath, nextPath)) {
            const sf = this.project.getSourceFile(change.fileName)
            if (sf) sf.applyTextChanges(preserveSpecifierExtensions(sf.getFullText(), change.textChanges))
        }
        this.rewriteOutgoingSpecifiers(nextPath)
        this.project.updateSourceFilePath(this, nextPath)
        this.filePath = nextPath
        this.compilerNode = parse(this.filePath, this.text)
        return this
    }

    getLineAndColumnAtPos(pos: number): {line: number; column: number} {
        const lc = this.compilerNode.getLineAndCharacterOfPosition(pos)
        return {line: lc.line + 1, column: lc.character + 1}
    }

    getStatements(): Node<ts.Statement>[] {
        return this.compilerNode.statements.map((stmt) => this.wrap(stmt))
    }

    getImportDeclarations(): Node<ts.ImportDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isImportDeclaration).map((node) => this.wrap(node))
    }

    getExportDeclarations(): Node<ts.ExportDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isExportDeclaration).map((node) => this.wrap(node))
    }

    getFunctions(): Node<ts.FunctionDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isFunctionDeclaration).map((node) => this.wrap(node))
    }

    getClasses(): Node<ts.ClassDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isClassDeclaration).map((node) => this.wrap(node))
    }

    getInterfaces(): Node<ts.InterfaceDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isInterfaceDeclaration).map((node) => this.wrap(node))
    }

    getTypeAliases(): Node<ts.TypeAliasDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isTypeAliasDeclaration).map((node) => this.wrap(node))
    }

    getEnums(): Node<ts.EnumDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isEnumDeclaration).map((node) => this.wrap(node))
    }

    getModules(): Node<ts.ModuleDeclaration>[] {
        return this.compilerNode.statements.filter(ts.isModuleDeclaration).map((node) => this.wrap(node))
    }

    getVariableStatements(): Node<ts.VariableStatement>[] {
        return this.compilerNode.statements.filter(ts.isVariableStatement).map((node) => this.wrap(node))
    }

    getDescendantsOfKind<T extends ts.Node>(kind: ts.SyntaxKind): Node<T>[] {
        const out: Node<T>[] = []
        const visit = (node: ts.Node): void => {
            if (node.kind === kind) out.push(this.wrap(node as T))
            node.forEachChild(visit)
        }
        visit(this.compilerNode)
        return out
    }

    getDescendantAtStartWithWidth(start: number, width: number): Node | undefined {
        let found: ts.Node | undefined
        const visit = (node: ts.Node): void => {
            if (found) return
            if (node.getStart(this.compilerNode) === start && node.getWidth(this.compilerNode) === width) {
                found = node
                return
            }
            node.forEachChild(visit)
        }
        visit(this.compilerNode)
        return found ? this.wrap(found) : undefined
    }

    getProgramNodeAtStartWithWidth(kind: ts.SyntaxKind, start: number, width: number): ts.Node | undefined {
        const programSf = this.project.getLanguageService().compilerObject.getProgram()?.getSourceFile(this.filePath)
        if (!programSf) return undefined
        let found: ts.Node | undefined
        const visit = (node: ts.Node): void => {
            if (found) return
            if (node.kind === kind && node.getStart(programSf) === start && node.getWidth(programSf) === width) {
                found = node
                return
            }
            node.forEachChild(visit)
        }
        visit(programSf)
        return found
    }

    wrapTokenAt(pos: number): Node | undefined {
        let found: ts.Node | undefined
        const visit = (node: ts.Node): void => {
            if (pos < node.getStart(this.compilerNode) || pos >= node.end) return
            found = node
            node.forEachChild(visit)
        }
        visit(this.compilerNode)
        return found ? this.wrap(found) : undefined
    }

    getExportedDeclarations(): Map<string, Node[]> {
        const programSf = this.project.getLanguageService().compilerObject.getProgram()?.getSourceFile(this.filePath)
        const checker = this.project.getLanguageService().compilerObject.getProgram()?.getTypeChecker()
        const symbol = checker && programSf ? checker.getSymbolAtLocation(programSf) : undefined
        const map = new Map<string, Node[]>()
        if (!checker || !symbol) return map
        for (const exp of checker.getExportsOfModule(symbol)) {
            const decls = exp.getDeclarations()?.map((decl) => this.project.getOrCreateSourceFile(decl.getSourceFile().fileName).wrap(decl)) ?? []
            map.set(exp.getName(), decls)
        }
        return map
    }

    getReferencingSourceFiles(): SourceFile[] {
        return this.project.getSourceFiles().filter((sf) => sf !== this && referencesSourceFile(sf, this))
    }

    wrap<T extends ts.Node>(node: T): Node<T> {
        return new Node(this.project.getOrCreateSourceFile(node.getSourceFile().fileName), node)
    }

    setText(text: string): void {
        this.text = text
        this.compilerNode = parse(this.filePath, text)
        this.project.updateSourceFileText(this.filePath, text)
    }

    private rewriteOutgoingSpecifiers(nextPath: string): void {
        const edits: ts.TextChange[] = []
        const visit = (node: ts.Node): void => {
            const lit = moduleSpecifierLiteral(node)
            if (lit) {
                const target = this.project.resolveModuleSpecifier(this, lit.text)
                if (target) {
                    const next = withOriginalExtension(relativeModuleSpecifier(path.dirname(nextPath), target.getFilePath()), extensionOf(lit.text))
                    edits.push({span: {start: lit.getStart(this.compilerNode) + 1, length: lit.text.length}, newText: next})
                }
            }
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                const arg = node.arguments[0]
                if (arg && ts.isStringLiteral(arg)) {
                    const target = this.project.resolveModuleSpecifier(this, arg.text)
                    if (target) {
                        const next = withOriginalExtension(relativeModuleSpecifier(path.dirname(nextPath), target.getFilePath()), extensionOf(arg.text))
                        edits.push({span: {start: arg.getStart(this.compilerNode) + 1, length: arg.text.length}, newText: next})
                    }
                }
            }
            node.forEachChild(visit)
        }
        visit(this.compilerNode)
        if (edits.length > 0) this.applyTextChanges(edits)
    }
}

// Parses with parent links so wrapper methods can navigate upward without a
// separate tree index.
function parse(filePath: string, text: string): ts.SourceFile {
    return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKindFromPath(filePath))
}

// Mirrors TypeScript's extension-based script kind selection for the file
// types ts-refine touches in tests and normal projects.
function scriptKindFromPath(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === ".tsx") return ts.ScriptKind.TSX
    if (ext === ".jsx") return ts.ScriptKind.JSX
    if (ext === ".json") return ts.ScriptKind.JSON
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS
    return ts.ScriptKind.TS
}

function referencesSourceFile(from: SourceFile, target: SourceFile): boolean {
    for (const decl of from.getImportDeclarations()) if (decl.getModuleSpecifierSourceFile() === target) return true
    for (const decl of from.getExportDeclarations()) if (decl.getModuleSpecifierSourceFile() === target) return true
    return false
}

function moduleSpecifierLiteral(node: ts.Node): ts.StringLiteral | undefined {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) return node.moduleReference.expression
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) return node.argument.literal
    return undefined
}

const KNOWN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json)$/

function extensionOf(specifier: string): string {
    return specifier.match(KNOWN_EXT)?.[0] ?? ""
}

function withOriginalExtension(specifier: string, ext: string): string {
    return specifier.replace(KNOWN_EXT, "") + ext
}

function preserveSpecifierExtensions(text: string, changes: readonly ts.TextChange[]): ts.TextChange[] {
    return changes.map((change) => {
        const original = text.slice(change.span.start, change.span.start + change.span.length)
        return {...change, newText: withOriginalExtension(change.newText, extensionOf(original))}
    })
}

function relativeModuleSpecifier(fromDir: string, toFile: string): string {
    const parsed = path.parse(toFile)
    let rel = path.relative(fromDir, path.join(parsed.dir, parsed.name)).replaceAll(path.sep, "/")
    if (!rel.startsWith(".")) rel = "./" + rel
    return rel
}

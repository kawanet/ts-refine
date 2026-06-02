// Shared target resolution for `rename --from` and `list --ref`. A target is a
// dotted spec (plain / ns.member / Type.prop / deeper); resolution is
// symbol-based — resolve the root name to its symbol(s), then walk the dotted
// members uniformly through the checker (a namespace export and a type member
// are the same `getExport`/`getMember` step). It returns every matching anchor
// (one name node per distinct symbol) and never throws on "not found": the
// caller decides — rename requires a single in-project match, list unions them.

import {type Identifier, Node, type Project, type Symbol as TsSymbol} from "ts-morph"
import {inProjectSourceFileOrThrow, inProjectSourceFiles} from "./source-files.ts"

export const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

// Split a dotted spec into its container path and leaf name, validating each
// segment. No depth cap — the symbol walk handles arbitrarily nested members.
export function parseTarget(spec: string): {path: string[]; name: string} {
    const parts = spec.split(".")
    for (const part of parts) {
        if (!IDENT.test(part)) throw new Error(`refine: not a valid identifier: ${part}`)
    }
    return {path: parts.slice(0, -1), name: parts[parts.length - 1]}
}

// In-project anchors for `spec`: one name node per distinct symbol the project
// declares under it (scoped to `file` when given). Throw-free — empty when the
// project declares nothing matching. Shared by rename and list's in-project path.
export function resolveInProjectAnchors(project: Project, spec: string, file: string | null): Identifier[] {
    const {path, name} = parseTarget(spec)
    const segments = [...path, name]
    const files = file ? [inProjectSourceFileOrThrow(project, file)] : inProjectSourceFiles(project)

    const roots: TsSymbol[] = []
    for (const sf of files) {
        const decls = sf.getExportedDeclarations().get(segments[0])
        if (decls) for (const d of decls) pushSymbol(roots, d.getSymbol())
        for (const mod of sf.getModules()) if (mod.getName() === segments[0]) pushSymbol(roots, mod.getSymbol())
    }
    return walkAnchors(roots, segments)
}

// Imported anchors (list --ref fallback): a bare root anchors on its import
// binding(s) — robust even for an anonymous default export; a member path
// follows the binding's aliased dependency symbol and walks its members.
export function resolveImportedAnchors(project: Project, spec: string): Identifier[] {
    const {path, name} = parseTarget(spec)
    const segments = [...path, name]
    const bindings = importBindingsNamed(project, segments[0])
    if (segments.length === 1) return dedupe(bindings)

    const roots: TsSymbol[] = []
    for (const binding of bindings) {
        const sym = binding.getSymbol()
        pushSymbol(roots, sym?.getAliasedSymbol() ?? sym)
    }
    return walkAnchors(roots, segments)
}

// From each root symbol, walk the dotted member segments (`getExport` falls
// back to `getMember`) and collect the final symbol's name node — deduped, one
// per distinct anchor.
function walkAnchors(roots: TsSymbol[], segments: string[]): Identifier[] {
    const anchors: Identifier[] = []
    for (const root of roots) {
        let sym: TsSymbol | undefined = root
        for (let i = 1; i < segments.length && sym; i++) {
            sym = sym.getExport(segments[i]) ?? sym.getMember(segments[i])
        }
        const node = sym && symbolNameNode(sym)
        if (node && !anchors.includes(node)) anchors.push(node)
    }
    return anchors
}

// The name Identifier of the symbol's first declaration that carries one.
function symbolNameNode(symbol: TsSymbol): Identifier | undefined {
    for (const decl of symbol.getDeclarations()) {
        const nn = (decl as {getNameNode?: () => Node | undefined}).getNameNode?.()
        if (nn && Node.isIdentifier(nn)) return nn
    }
    return undefined
}

// Every local import binding called `name` (default / namespace / named, alias
// respected) across in-project files.
function importBindingsNamed(project: Project, name: string): Identifier[] {
    const found: Identifier[] = []
    for (const sf of inProjectSourceFiles(project)) {
        for (const imp of sf.getImportDeclarations()) {
            const clause = imp.getImportClause()
            if (!clause) continue
            const def = clause.getDefaultImport()
            if (def && def.getText() === name) found.push(def)
            const named = clause.getNamedBindings()
            if (!named) continue
            if (Node.isNamespaceImport(named)) {
                const nn = named.getNameNode()
                if (nn.getText() === name) found.push(nn)
            } else if (Node.isNamedImports(named)) {
                for (const el of named.getElements()) {
                    const local = el.getAliasNode() ?? el.getNameNode()
                    if (local.getText() === name && Node.isIdentifier(local)) found.push(local)
                }
            }
        }
    }
    return found
}

function pushSymbol(into: TsSymbol[], sym: TsSymbol | undefined): void {
    if (sym && !into.includes(sym)) into.push(sym)
}

function dedupe(nodes: Identifier[]): Identifier[] {
    const out: Identifier[] = []
    for (const node of nodes) if (!out.includes(node)) out.push(node)
    return out
}

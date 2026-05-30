// `rename`: rename an exported identifier across the whole project. The TS
// Language Service rename (ts-morph's Node#rename) rewrites the declaration,
// every importer's binding, and every usage in one pass — and already keeps
// an importer's local alias intact (`{from as x}` → `{to as x}`). After the
// rename, the touched files' import blocks are re-sorted (organizeImports)
// using the project's surveyed style; files that don't reference the symbol
// are never touched.
//
// A dotted `from`/`to` (e.g. `TSR.ReportResult`) targets a member of that
// namespace instead of a top-level export. Renaming is name-only: the
// namespace part of `from` and `to` must match — moving a member across
// namespaces is out of scope. Namespace members aren't `export`ed, so they
// are resolved by structural lookup (getInterface / getTypeAlias / ...),
// not via getExportedDeclarations.
//
// Scope: named exports / named namespace members. Converting default <->
// named export is a separate concern. On a name collision (the target name
// already exists) we refuse rather than emit shadowed/broken code.

import {Node, type Identifier, type ModuleDeclaration, type Project, type SourceFile} from "ts-morph"
import type * as declared from "ts-refine"
import {displayPath} from "../lib/source-files.ts"
import {organizeChangedImports} from "../recommend/organize-changed.ts"

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

// A rename target split into an optional namespace and the member/identifier
// name. `ns` is null for a top-level export.
interface Target {
    ns: string | null
    name: string
}

export const refineRename: typeof declared.refineRename = async (project, opts) => {
    const {from, to, file, dryRun, report} = opts

    const fromT = parseTarget(from)
    const toT = parseTarget(to)
    if (from === to) throw new Error("rename: --from and --to are the same")
    if (fromT.ns !== toT.ns) {
        throw new Error(`rename: --from and --to must stay in the same namespace (cross-namespace rename is out of scope): ${from} -> ${to}`)
    }
    for (const part of [fromT.ns, fromT.name, toT.name]) {
        if (part !== null && !IDENT.test(part)) throw new Error(`rename: not a valid identifier: ${part}`)
    }

    const nameNode = fromT.ns === null ? resolveExportedName(project, fromT.name, file) : resolveNamespaceMember(project, fromT.ns, fromT.name, file)

    // Reference locations cover the declaration, importer bindings, and
    // usages — the exact set of files the rename will edit.
    const refs = nameNode.findReferencesAsNodes()
    const targetFiles = new Set<SourceFile>([nameNode.getSourceFile()])
    for (const r of refs) targetFiles.add(r.getSourceFile())

    // Collision guard: refuse if the target name already exists where the
    // rename would land. Top-level renames can clash with any touched file's
    // top-level binding; a namespace member can only clash with another
    // member of the same namespace (its references are qualified).
    const collisions =
        fromT.ns === null
            ? [...targetFiles].filter((sf) => fileDeclaresTopLevel(sf, toT.name))
            : findNamespaceMembers(project, fromT.ns, toT.name, file).map((n) => n.getSourceFile())
    if (collisions.length > 0) {
        const where = [...new Set(collisions)].map((sf) => displayPath(sf.getFilePath())).join(", ")
        throw new Error(`rename: \`${to}\` already exists in: ${where} (aliasing on collision is not supported yet)`)
    }

    nameNode.rename(toT.name)

    // Re-sort imports in every file the rename edited, so a changed import
    // binding leaves a tidy, conventionally-ordered block.
    organizeChangedImports(targetFiles, report)

    const touched = [...targetFiles]
    if (dryRun) {
        for (const sf of touched) console.log(`would update: ${displayPath(sf.getFilePath())}`)
    } else {
        for (const sf of touched) await sf.save()
    }

    const verb = dryRun ? "would rename" : "renamed"
    console.error(`rename: ${verb} ${from} -> ${to} in ${touched.length} file${touched.length === 1 ? "" : "s"}`)

    return {from, to, touched: touched.map((sf) => sf.getFilePath())}
}

// Split `a.b` into {ns: "a", name: "b"} and a bare `b` into {ns: null,
// name: "b"}. Only a single namespace level is supported.
function parseTarget(spec: string): Target {
    const parts = spec.split(".")
    if (parts.length === 1) return {ns: null, name: parts[0]}
    if (parts.length === 2) return {ns: parts[0], name: parts[1]}
    throw new Error(`rename: nested namespaces are not supported: ${spec}`)
}

// Locate the renameable name node for a top-level exported identifier.
// With a file given, restrict to that file's exports (form ②); otherwise
// the symbol must be uniquely exported across the project (form ①) — zero
// or multiple distinct declarations are an error.
function resolveExportedName(project: Project, from: string, file: string | null): Identifier {
    if (file) {
        const sf = project.getSourceFile(file)
        if (!sf) throw new Error(`rename: not in the project: ${file}`)
        const decls = sf.getExportedDeclarations().get(from)
        if (!decls || decls.length === 0) {
            throw new Error(`rename: ${displayPath(file)} does not export: ${from}`)
        }
        return nameIdentifier(decls[0], from)
    }

    // Project-wide: collect distinct declarations exported under `from`.
    const found = new Set<Node>()
    for (const sf of project.getSourceFiles()) {
        const decls = sf.getExportedDeclarations().get(from)
        if (decls) for (const d of decls) found.add(d)
    }
    if (found.size === 0) throw new Error(`rename: no exported identifier named: ${from}`)
    if (found.size > 1) {
        throw new Error(`rename: \`${from}\` is exported from multiple places; pass the defining file to disambiguate`)
    }
    return nameIdentifier([...found][0], from)
}

// Locate the renameable name node for `<ns>.<name>` — a member of namespace
// `ns`. Mirrors resolveExportedName's file-scope / uniqueness rules.
function resolveNamespaceMember(project: Project, ns: string, name: string, file: string | null): Identifier {
    if (file) {
        const sf = project.getSourceFile(file)
        if (!sf) throw new Error(`rename: not in the project: ${file}`)
        const nodes = findNamespaceMembers(project, ns, name, file)
        if (nodes.length === 0) throw new Error(`rename: ${displayPath(file)} has no member ${ns}.${name}`)
        return nodes[0]
    }

    const nodes = findNamespaceMembers(project, ns, name, null)
    if (nodes.length === 0) throw new Error(`rename: no namespace member named: ${ns}.${name}`)
    if (nodes.length > 1) {
        throw new Error(`rename: \`${ns}.${name}\` is declared in multiple places; pass the defining file to disambiguate`)
    }
    return nodes[0]
}

// Every name node for member `name` of a top-level namespace `ns`, across the
// project (or a single file). Members are looked up structurally because they
// are intentionally not `export`ed within the namespace.
function findNamespaceMembers(project: Project, ns: string, name: string, file: string | null): Identifier[] {
    const files = file ? [project.getSourceFileOrThrow(file)] : project.getSourceFiles()
    const nodes: Identifier[] = []
    for (const sf of files) {
        const mod = sf.getModule(ns)
        if (!mod) continue
        const nn = namespaceMemberNameNode(mod, name)
        if (nn) nodes.push(nn)
    }
    return nodes
}

// The name Identifier of a namespace member, whatever kind it is.
function namespaceMemberNameNode(mod: ModuleDeclaration, name: string): Identifier | undefined {
    const decl = mod.getInterface(name) ?? mod.getTypeAlias(name) ?? mod.getEnum(name) ?? mod.getClass(name) ?? mod.getFunction(name) ?? mod.getVariableDeclaration(name) ?? mod.getModule(name)
    if (!decl) return undefined
    const nn = (decl as {getNameNode?: () => Node | undefined}).getNameNode?.()
    return nn && Node.isIdentifier(nn) ? nn : undefined
}

// Pull the renameable Identifier out of an exported declaration. Default
// exports and expression exports have no rename target here (out of scope).
function nameIdentifier(decl: Node, from: string): Identifier {
    const nameNode = (decl as {getNameNode?: () => Node | undefined}).getNameNode?.()
    if (nameNode && Node.isIdentifier(nameNode)) return nameNode
    throw new Error(`rename: cannot rename \`${from}\` (unsupported export form; default/expression exports are out of scope)`)
}

// True when the file declares `name` at module top level (function, class,
// interface, type alias, enum, top-level variable, or an import binding).
// Used only for the collision guard, so a broad check that errs toward
// refusing is acceptable.
function fileDeclaresTopLevel(sf: SourceFile, name: string): boolean {
    for (const f of sf.getFunctions()) if (f.getName() === name) return true
    for (const c of sf.getClasses()) if (c.getName() === name) return true
    for (const i of sf.getInterfaces()) if (i.getName() === name) return true
    for (const t of sf.getTypeAliases()) if (t.getName() === name) return true
    for (const e of sf.getEnums()) if (e.getName() === name) return true
    for (const vs of sf.getVariableStatements()) {
        for (const v of vs.getDeclarations()) if (v.getName() === name) return true
    }
    for (const imp of sf.getImportDeclarations()) {
        const clause = imp.getImportClause()
        if (!clause) continue
        if (clause.getDefaultImport()?.getText() === name) return true
        const named = clause.getNamedBindings()
        if (!named) continue
        if (Node.isNamespaceImport(named) && named.getNameNode().getText() === name) return true
        if (Node.isNamedImports(named)) {
            for (const el of named.getElements()) {
                const local = el.getAliasNode()?.getText() ?? el.getNameNode().getText()
                if (local === name) return true
            }
        }
    }
    return false
}

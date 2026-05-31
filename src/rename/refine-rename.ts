// `rename`: rename an identifier in place across the project via the TS
// language-service rename. The leaf of a dotted spec is renamed; leading
// segments locate the container (top-level / namespace / interface|class),
// which `from` and `to` must share — a member is never moved across containers.
//
// Supported `from`/`to` shapes and the collision/scope rules live in parseTarget
// and resolveTarget below; the surveyed `report` drives the post-rename
// organizeImports.

import {type ClassDeclaration, type Identifier, type InterfaceDeclaration, type ModuleDeclaration, Node, type Project, type SourceFile} from "ts-morph"
import type * as declared from "ts-refine"
import {displayPath} from "../lib/source-files.ts"
import {organizeChangedImports} from "../recommend/organize-changed.ts"

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

// A rename target: the container path (0–2 segments: namespace and/or type)
// plus the leaf name being renamed.
interface Target {
    path: string[]
    name: string
}

// What a resolved target renames, plus how to detect a name collision for the
// would-be new name. Keeping the collision check beside resolution means each
// target shape (top-level / namespace member / member) carries its own rule.
interface Resolved {
    node: Identifier
    collisions: (toName: string, targetFiles: Set<SourceFile>) => SourceFile[]
}

export const refineRename: typeof declared.refineRename = async (project, opts) => {
    const {from, to, file, dryRun, report, log} = opts

    const fromT = parseTarget(from)
    const toT = parseTarget(to)
    if (from === to) throw new Error("rename: --from and --to are the same")
    if (fromT.path.join(".") !== toT.path.join(".")) {
        throw new Error(`rename: --from and --to must keep the same container (moving across namespaces or types is out of scope): ${from} -> ${to}`)
    }
    for (const part of [...fromT.path, fromT.name, toT.name]) {
        if (!IDENT.test(part)) throw new Error(`rename: not a valid identifier: ${part}`)
    }

    const resolved = resolveTarget(project, fromT, file)

    // Reference locations cover the declaration, importer bindings, and
    // usages — the exact set of files the rename will edit.
    const refs = resolved.node.findReferencesAsNodes()
    const targetFiles = new Set<SourceFile>([resolved.node.getSourceFile()])
    for (const r of refs) targetFiles.add(r.getSourceFile())

    // Collision guard: refuse if the target name already exists where the
    // rename would land.
    const collisions = resolved.collisions(toT.name, targetFiles)
    if (collisions.length > 0) {
        const where = [...new Set(collisions)].map((sf) => displayPath(sf.getFilePath())).join(", ")
        throw new Error(`rename: \`${to}\` already exists in: ${where} (aliasing on collision is not supported yet)`)
    }

    resolved.node.rename(toT.name)

    // Re-sort imports in every file the rename edited, so a changed import
    // binding leaves a tidy, conventionally-ordered block.
    organizeChangedImports(targetFiles, report)

    const touched = [...targetFiles]
    if (!dryRun) for (const sf of touched) await sf.save()
    // Per-file progress on the log (stdout is reserved for command results);
    // the verb tracks dryRun.
    for (const sf of touched) {
        log.write(`${dryRun ? "would update" : "updated"}: ${displayPath(sf.getFilePath())}\n`)
    }

    const verb = dryRun ? "would rename" : "renamed"
    log.write(`rename: ${verb} ${from} -> ${to} in ${touched.length} file${touched.length === 1 ? "" : "s"}\n`)

    return {from, to, touched: touched.map((sf) => sf.getFilePath())}
}

// Split a dotted spec into its container path and leaf name. At most three
// segments (ns.Type.prop); deeper paths aren't a shape we resolve.
function parseTarget(spec: string): Target {
    const parts = spec.split(".")
    if (parts.length > 3) throw new Error(`rename: too many segments (max ns.Type.prop): ${spec}`)
    return {path: parts.slice(0, -1), name: parts[parts.length - 1]}
}

// Resolve a target to the name node it renames, plus its collision rule.
function resolveTarget(project: Project, target: Target, file: string | null): Resolved {
    const {path, name} = target

    // Top-level export.
    if (path.length === 0) {
        return {node: resolveExportedName(project, name, file), collisions: (toName, targetFiles) => topLevelCollisions(targetFiles, toName)}
    }

    // `ns.member` where `ns` is an actual namespace (takes precedence over a
    // same-named type), e.g. TSR.ReportResult.
    if (path.length === 1 && isNamespace(project, path[0])) {
        const ns = path[0]
        return {node: resolveNamespaceMember(project, ns, name, file), collisions: (toName) => namespaceCollisions(project, ns, toName)}
    }

    // Otherwise a member of an interface/class container: `Type.prop` or
    // `ns.Type.prop`.
    const container = resolveContainerType(project, path, file)
    const node = memberNameNode(container, name)
    if (!node) throw new Error(`rename: ${path.join(".")} has no member named: ${name}`)
    return {node, collisions: (toName) => (memberNameNode(container, toName) ? [container.getSourceFile()] : [])}
}

// Locate the renameable name node for a top-level exported identifier.
function resolveExportedName(project: Project, from: string, file: string | null): Identifier {
    return nameIdentifier(resolveExportedDecl(project, from, file), from)
}

// The declaration exported under `from`. With a file given, restrict to that
// file's exports; otherwise the symbol must be uniquely exported across the
// project — zero or multiple distinct declarations are an error.
function resolveExportedDecl(project: Project, from: string, file: string | null): Node {
    if (file) {
        const sf = project.getSourceFile(file)
        if (!sf) throw new Error(`rename: not in the project: ${file}`)
        const decls = sf.getExportedDeclarations().get(from)
        if (!decls || decls.length === 0) {
            throw new Error(`rename: ${displayPath(file)} does not export: ${from}`)
        }
        return decls[0]
    }

    const found = new Set<Node>()
    for (const sf of project.getSourceFiles()) {
        const decls = sf.getExportedDeclarations().get(from)
        if (decls) for (const d of decls) found.add(d)
    }
    if (found.size === 0) throw new Error(`rename: no exported identifier named: ${from}`)
    if (found.size > 1) {
        throw new Error(`rename: \`${from}\` is exported from multiple places; pass the defining file to disambiguate`)
    }
    return [...found][0]
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

// The interface/class container for a member rename: a top-level exported type
// (`Type.prop`) or a namespace-nested one (`ns.Type.prop`).
function resolveContainerType(project: Project, path: string[], file: string | null): InterfaceDeclaration | ClassDeclaration {
    if (path.length === 1) {
        const decl = resolveExportedDecl(project, path[0], file)
        if (Node.isInterfaceDeclaration(decl) || Node.isClassDeclaration(decl)) return decl
        throw new Error(`rename: ${path[0]} is not an interface or class (only their members can be renamed by property)`)
    }

    const [ns, typeName] = path
    const found = findNamespaceTypes(project, ns, typeName, file)
    if (found.length === 0) throw new Error(`rename: no interface or class named: ${ns}.${typeName}`)
    if (found.length > 1) {
        throw new Error(`rename: \`${ns}.${typeName}\` is declared in multiple places; pass the defining file to disambiguate`)
    }
    return found[0]
}

// Whether any source file declares a top-level namespace called `name`.
function isNamespace(project: Project, name: string): boolean {
    return project.getSourceFiles().some((sf) => sf.getModules().some((m) => m.getName() === name))
}

// The name Identifier of an interface/class member (property, method, or — for
// classes — an accessor). String-literal and computed member names have no
// Identifier to rename and return undefined.
function memberNameNode(container: InterfaceDeclaration | ClassDeclaration, name: string): Identifier | undefined {
    const member = container.getProperty(name) ?? container.getMethod(name) ?? (Node.isClassDeclaration(container) ? (container.getGetAccessor(name) ?? container.getSetAccessor(name)) : undefined)
    if (!member) return undefined
    const nn = member.getNameNode()
    return Node.isIdentifier(nn) ? nn : undefined
}

// Every name node for member `name` of a top-level namespace `ns`, across the
// project (or a single file). Members are looked up structurally because they
// are intentionally not `export`ed within the namespace. A namespace can be
// declared as several `namespace ns {}` blocks (merged) within and across
// files, so every matching block is scanned — getModule would see only one.
function findNamespaceMembers(project: Project, ns: string, name: string, file: string | null): Identifier[] {
    const files = file ? [project.getSourceFileOrThrow(file)] : project.getSourceFiles()
    const nodes: Identifier[] = []
    for (const sf of files) {
        for (const mod of sf.getModules()) {
            if (mod.getName() !== ns) continue
            const nn = namespaceMemberNameNode(mod, name)
            if (nn) nodes.push(nn)
        }
    }
    return nodes
}

// Every interface/class named `typeName` inside namespace `ns` (one per
// matching merged block), across the project or a single file.
function findNamespaceTypes(project: Project, ns: string, typeName: string, file: string | null): (InterfaceDeclaration | ClassDeclaration)[] {
    const files = file ? [project.getSourceFileOrThrow(file)] : project.getSourceFiles()
    const found: (InterfaceDeclaration | ClassDeclaration)[] = []
    for (const sf of files) {
        for (const mod of sf.getModules()) {
            if (mod.getName() !== ns) continue
            const decl = mod.getInterface(typeName) ?? mod.getClass(typeName)
            if (decl) found.push(decl)
        }
    }
    return found
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

// Files that already declare `name` at the top level — every such file
// (among those the rename would touch) is a collision site.
function topLevelCollisions(files: Iterable<SourceFile>, name: string): SourceFile[] {
    return [...files].filter((sf) => fileDeclaresTopLevel(sf, name))
}

// Files that already declare `<ns>.<name>` — every such file is a
// collision site for a namespace-member rename. Scanned project-wide
// because a namespace can merge across files.
function namespaceCollisions(project: Project, ns: string, name: string): SourceFile[] {
    return findNamespaceMembers(project, ns, name, null).map((n) => n.getSourceFile())
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

// Shared target resolution for `rename --from` and `list --ref`. A target is a
// dotted spec (plain / ns.member / Type.prop / ns.Type.prop) that resolves to
// the single name Identifier it denotes; both commands then act on that node
// (rename rewrites it, list finds its references). Collision detection is
// rename-specific and stays in refine-rename.

import {type ClassDeclaration, type Identifier, type InterfaceDeclaration, type ModuleDeclaration, Node, type Project, type Symbol as TsSymbol} from "ts-morph"
import {displayPath, inProjectSourceFileOrThrow, inProjectSourceFiles} from "./source-files.ts"

export const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

// A parsed target: the container path (0–2 segments: namespace and/or type)
// plus the leaf name.
interface Target {
    path: string[]
    name: string
}

// How a target resolved, with the context each rename collision rule needs:
// the namespace for a `ns.member`, or the container for a `Type.prop` member.
type TargetKind = "exported" | "namespace-member" | "type-member"

export interface ResolvedTarget {
    node: Identifier
    kind: TargetKind
    namespace?: string
    container?: InterfaceDeclaration | ClassDeclaration
}

// Split a dotted spec into its container path and leaf name. At most three
// segments (ns.Type.prop); deeper paths aren't a shape we resolve.
export function parseTarget(spec: string): Target {
    const parts = spec.split(".")
    if (parts.length > 3) throw new Error(`refine: too many segments (max ns.Type.prop): ${spec}`)
    return {path: parts.slice(0, -1), name: parts[parts.length - 1]}
}

// Resolve a spec to its name node plus the shape context. `file` scopes a
// non-unique name to its defining file; null requires a project-unique symbol.
export function resolveTarget(project: Project, spec: string, file: string | null): ResolvedTarget {
    const {path, name} = parseTarget(spec)
    for (const part of [...path, name]) {
        if (!IDENT.test(part)) throw new Error(`refine: not a valid identifier: ${part}`)
    }

    // Top-level export.
    if (path.length === 0) {
        return {node: resolveExportedName(project, name, file), kind: "exported"}
    }

    // `ns.member` where `ns` is an actual namespace (takes precedence over a
    // same-named type), e.g. TSR.ReportResult.
    if (path.length === 1 && isNamespace(project, path[0])) {
        return {node: resolveNamespaceMember(project, path[0], name, file), kind: "namespace-member", namespace: path[0]}
    }

    // Otherwise a member of an interface/class container: `Type.prop` or
    // `ns.Type.prop`.
    const container = resolveContainerType(project, path, file)
    const node = memberNameNode(container, name)
    if (!node) throw new Error(`refine: ${path.join(".")} has no member named: ${name}`)
    return {node, kind: "type-member", container}
}

// Convenience for callers that only need the name node (e.g. list --ref).
export function resolveTargetNode(project: Project, spec: string, file: string | null): Identifier {
    return resolveTarget(project, spec, file).node
}

// `list --ref` anchor: the node a reference search starts from. An in-project
// name resolves through the very same resolver rename uses (resolveTarget —
// same dotted forms, same ambiguity errors). Only a name the project merely
// imports falls back to the dependency symbol it aliases (and its members), so
// `--ref` reaches dependency symbols too. Read-only; rename never takes the
// fallback, so it can never reach into a dependency.
export function resolveReferenceTarget(project: Project, spec: string): Identifier {
    const segments = spec.split(".")
    for (const seg of segments) {
        if (!IDENT.test(seg)) throw new Error(`refine: not a valid identifier: ${seg}`)
    }

    // Shared in-project path: identical resolution (and errors) to rename.
    if (isInProjectRoot(project, segments[0])) {
        return resolveTarget(project, spec, null).node
    }

    // Fallback (list-only): a name the project only imports. A bare root anchors
    // on the import binding itself (works even for an anonymous default export);
    // a member path resolves the aliased dependency symbol and walks its members
    // via the checker, then anchors on the member declaration.
    const binding = firstImportBinding(project, segments[0])
    if (!binding) throw new Error(`refine: no exported or imported identifier named: ${segments[0]}`)
    if (segments.length === 1) return binding

    const bindingSymbol = binding.getSymbol()
    let symbol = bindingSymbol?.getAliasedSymbol() ?? bindingSymbol
    for (let i = 1; i < segments.length; i++) {
        const member = symbol?.getExport(segments[i]) ?? symbol?.getMember(segments[i])
        if (!member) throw new Error(`refine: ${segments.slice(0, i).join(".")} has no member named: ${segments[i]}`)
        symbol = member
    }

    const node = symbol && symbolNameNode(symbol)
    if (!node) throw new Error(`refine: cannot resolve \`${spec}\` to a named declaration`)
    return node
}

// Whether the project itself declares `name` — an exported member or a
// namespace — so a `--ref` spec rooted there resolves in-project (shared with
// rename) instead of falling back to a same-named imported symbol.
function isInProjectRoot(project: Project, name: string): boolean {
    return inProjectSourceFiles(project).some((sf) => sf.getExportedDeclarations().has(name) || sf.getModules().some((m) => m.getName() === name))
}

// The name Identifier of the symbol's first declaration that carries one — the
// node a reference search anchors on.
function symbolNameNode(symbol: TsSymbol): Identifier | undefined {
    for (const decl of symbol.getDeclarations()) {
        const nn = (decl as {getNameNode?: () => Node | undefined}).getNameNode?.()
        if (nn && Node.isIdentifier(nn)) return nn
    }
    return undefined
}

// The local name node of the first in-project import binding called `name`
// (default / namespace / named, alias respected). Lets the root resolve to a
// symbol the project imports rather than declares.
function firstImportBinding(project: Project, name: string): Identifier | undefined {
    for (const sf of inProjectSourceFiles(project)) {
        for (const imp of sf.getImportDeclarations()) {
            const clause = imp.getImportClause()
            if (!clause) continue
            const def = clause.getDefaultImport()
            if (def && def.getText() === name) return def
            const named = clause.getNamedBindings()
            if (!named) continue
            if (Node.isNamespaceImport(named)) {
                const nn = named.getNameNode()
                if (nn.getText() === name) return nn
            } else if (Node.isNamedImports(named)) {
                for (const el of named.getElements()) {
                    const local = el.getAliasNode() ?? el.getNameNode()
                    if (local.getText() === name && Node.isIdentifier(local)) return local
                }
            }
        }
    }
    return undefined
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
        const sf = inProjectSourceFileOrThrow(project, file)
        const decls = sf.getExportedDeclarations().get(from)
        if (!decls || decls.length === 0) {
            throw new Error(`refine: ${displayPath(file)} does not export: ${from}`)
        }
        return decls[0]
    }

    const found = new Set<Node>()
    for (const sf of inProjectSourceFiles(project)) {
        const decls = sf.getExportedDeclarations().get(from)
        if (decls) for (const d of decls) found.add(d)
    }
    if (found.size === 0) throw new Error(`refine: no exported identifier named: ${from}`)
    if (found.size > 1) {
        throw new Error(`refine: \`${from}\` is exported from multiple places; pass the defining file to disambiguate`)
    }
    return [...found][0]
}

// Locate the name node for `<ns>.<name>` — a member of namespace `ns`.
// Mirrors resolveExportedName's file-scope / uniqueness rules.
function resolveNamespaceMember(project: Project, ns: string, name: string, file: string | null): Identifier {
    if (file) {
        // findNamespaceMembers validates the file scope (via inProjectSourceFileOrThrow).
        const nodes = findNamespaceMembers(project, ns, name, file)
        if (nodes.length === 0) throw new Error(`refine: ${displayPath(file)} has no member ${ns}.${name}`)
        return nodes[0]
    }

    const nodes = findNamespaceMembers(project, ns, name, null)
    if (nodes.length === 0) throw new Error(`refine: no namespace member named: ${ns}.${name}`)
    if (nodes.length > 1) {
        throw new Error(`refine: \`${ns}.${name}\` is declared in multiple places; pass the defining file to disambiguate`)
    }
    return nodes[0]
}

// The interface/class container for a member target: a top-level exported type
// (`Type.prop`) or a namespace-nested one (`ns.Type.prop`).
function resolveContainerType(project: Project, path: string[], file: string | null): InterfaceDeclaration | ClassDeclaration {
    if (path.length === 1) {
        const decl = resolveExportedDecl(project, path[0], file)
        if (Node.isInterfaceDeclaration(decl) || Node.isClassDeclaration(decl)) return decl
        throw new Error(`refine: ${path[0]} is not an interface or class (only their members can be addressed by property)`)
    }

    const [ns, typeName] = path
    const found = findNamespaceTypes(project, ns, typeName, file)
    if (found.length === 0) throw new Error(`refine: no interface or class named: ${ns}.${typeName}`)
    if (found.length > 1) {
        throw new Error(`refine: \`${ns}.${typeName}\` is declared in multiple places; pass the defining file to disambiguate`)
    }
    return found[0]
}

// Whether any in-project file declares a top-level namespace called `name`.
function isNamespace(project: Project, name: string): boolean {
    return inProjectSourceFiles(project).some((sf) => sf.getModules().some((m) => m.getName() === name))
}

// The name Identifier of an interface/class member (property, method, or — for
// classes — an accessor). String-literal and computed member names have no
// Identifier and return undefined.
export function memberNameNode(container: InterfaceDeclaration | ClassDeclaration, name: string): Identifier | undefined {
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
export function findNamespaceMembers(project: Project, ns: string, name: string, file: string | null): Identifier[] {
    const files = file ? [inProjectSourceFileOrThrow(project, file)] : inProjectSourceFiles(project)
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
    const files = file ? [inProjectSourceFileOrThrow(project, file)] : inProjectSourceFiles(project)
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

// Pull the name Identifier out of an exported declaration. Default exports and
// expression exports have no such node (out of scope).
function nameIdentifier(decl: Node, from: string): Identifier {
    const nameNode = (decl as {getNameNode?: () => Node | undefined}).getNameNode?.()
    if (nameNode && Node.isIdentifier(nameNode)) return nameNode
    throw new Error(`refine: cannot resolve \`${from}\` (unsupported declaration form; default/expression exports are out of scope)`)
}

// `rename`: rename an identifier in place across the project via the TS
// language-service rename. The leaf of a dotted spec is renamed; leading
// segments locate the container (top-level / namespace / interface|class),
// which `from` and `to` must share — a member is never moved across containers.
//
// Target parsing/resolution is shared with `list --ref` (lib/resolve-target.ts);
// only the collision guard below is rename-specific. The surveyed `format`
// style drives the post-rename organizeImports.

import {Node, type Project, type SourceFile} from "ts-morph"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {findNamespaceMembers, IDENT, memberNameNode, parseTarget, type ResolvedTarget, resolveTarget} from "../lib/resolve-target.ts"
import {displayPath} from "../lib/source-files.ts"
import {organizeChangedImports} from "../recommend/organize-changed.ts"

export const refineRename: typeof declared.refineRename = async (opts) => {
    const {from, to, file, dryRun, format, log} = opts
    const project = resolveProject(opts)

    const fromT = parseTarget(from)
    const toT = parseTarget(to)
    if (from === to) throw new Error("rename: --from and --to are the same")
    if (fromT.path.join(".") !== toT.path.join(".")) {
        throw new Error(`rename: --from and --to must keep the same container (moving across namespaces or types is out of scope): ${from} -> ${to}`)
    }

    // `from` is validated while resolving; the new name `to` is checked here.
    for (const part of [...toT.path, toT.name]) {
        if (!IDENT.test(part)) throw new Error(`rename: not a valid identifier: ${part}`)
    }

    const resolved = resolveTarget(project, from, file)

    // Reference locations cover the declaration, importer bindings, and
    // usages — the exact set of files the rename will edit.
    const refs = resolved.node.findReferencesAsNodes()
    const targetFiles = new Set<SourceFile>([resolved.node.getSourceFile()])
    for (const r of refs) targetFiles.add(r.getSourceFile())

    // Collision guard: refuse if the target name already exists where the
    // rename would land.
    const collisions = renameCollisions(project, resolved, toT.name, targetFiles)
    if (collisions.length > 0) {
        const where = [...new Set(collisions)].map((sf) => displayPath(sf.getFilePath())).join(", ")
        throw new Error(`rename: \`${to}\` already exists in: ${where} (aliasing on collision is not supported yet)`)
    }

    resolved.node.rename(toT.name)

    // Re-sort imports in every file the rename edited, so a changed import
    // binding leaves a tidy, conventionally-ordered block.
    organizeChangedImports(targetFiles, format)

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

// Collision sites for the new name, keyed by target shape: a namespace member
// collides project-wide, a type member within its container, and a top-level
// name against same-named declarations in the files the rename would touch.
function renameCollisions(project: Project, resolved: ResolvedTarget, toName: string, targetFiles: Set<SourceFile>): SourceFile[] {
    if (resolved.kind === "namespace-member") {
        return findNamespaceMembers(project, resolved.namespace!, toName, null).map((n) => n.getSourceFile())
    }
    if (resolved.kind === "type-member") {
        const container = resolved.container!
        return memberNameNode(container, toName) ? [container.getSourceFile()] : []
    }
    return [...targetFiles].filter((sf) => fileDeclaresTopLevel(sf, toName))
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

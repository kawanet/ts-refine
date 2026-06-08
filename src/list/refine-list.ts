// `list`: per-file export / usage snapshot. For each in-project file (external
// library declarations aside, .d.ts included) it counts exported declarations,
// how many of those have no external reference (unused), and how many other
// files import it. The optional ListFilters narrow the result here, so callers
// receive exactly the cleanup candidates they asked for.
//
// The export/unused counting mirrors the unused-exports report; the two
// will be unified in a later pass (that report is left untouched for now).

import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {Node, type Project} from "../bridge/bridge.ts"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {resolveImportedAnchors, resolveInProjectAnchors} from "../lib/resolve-target.ts"
import {displayPath, selectSourceFiles} from "../lib/source-files.ts"

export const refineList: typeof declared.refineList = async (opts) => {
    const {paths = [], filters, log} = opts
    const project = resolveProject(opts)
    const sourceFiles = selectSourceFiles(project, {paths})

    const entries: TSR.ListEntry[] = []
    for (const sf of sourceFiles) {
        let exports = 0
        let unused = 0
        for (const [, decls] of sf.getExportedDeclarations()) {
            for (const decl of decls) {
                // Re-export passthrough: count only declarations that live here.
                if (decl.getSourceFile() !== sf) continue
                exports++
                if (!Node.isReferenceFindable(decl)) continue
                const target = "getNameNode" in decl && typeof (decl as any).getNameNode === "function" ? ((decl as any).getNameNode() ?? decl) : decl
                if (!Node.isReferenceFindable(target)) continue

                const declStart = target.getStart()
                let externalRefs = 0
                for (const ref of target.findReferencesAsNodes()) {
                    const refSf = ref.getSourceFile()
                    if (refSf === sf && ref.getStart() === declStart) continue
                    if (refSf !== sf) externalRefs++
                }
                if (externalRefs === 0) unused++
            }
        }

        // Importers = other in-project files (including .d.ts) that reference
        // this one. External declarations are not project files, so drop them.
        const importers = sf.getReferencingSourceFiles().filter((r) => r !== sf && !r.isFromExternalLibrary()).length

        entries.push({file: displayPath(sf.getFilePath()), exports, unused, importers})
    }

    entries.sort((a, b) => a.file.localeCompare(b.file))

    let result = filters ? entries.filter((e) => keepEntry(e, filters)) : entries
    if (filters?.ref != null) {
        // Resolve the target project-wide (a file glob scopes the listing, not
        // the lookup) and keep only listed files that reference it.
        const refFiles = referencedFiles(project, filters.ref)
        result = result.filter((e) => refFiles.has(e.file))
    }

    // Emitted before the table: report what matched against the total scanned,
    // so a filtered run does not look like it mislabelled the whole project.
    logging(log, `list: ${result.length} files found / ${entries.length} files total`)
    return result
}

// AND semantics: an entry survives only when it matches every filter that is
// set. With no filter active every entry passes. `ref` is applied separately
// because it needs the project to resolve references.
function keepEntry(e: TSR.ListEntry, f: TSR.ListFilters): boolean {
    if (f.noExports && e.exports !== 0) return false
    if (f.noImporters && e.importers !== 0) return false
    if (f.unusedExports && e.unused === 0) return false
    return true
}

// Display paths of every file that references `spec`. In-project matches win
// (a name the project declares); only when there are none does it fall back to
// what the project imports. Same-origin matches are OR-unioned, so a name with
// several declarations lists every file that uses any of them. Out-of-project
// anchors (a dependency `.d.ts`) drop out — the caller lists in-project entries.
function referencedFiles(project: Project, spec: string): Set<string> {
    let anchors = resolveInProjectAnchors(project, spec, null)
    if (anchors.length === 0) anchors = resolveImportedAnchors(project, spec)
    if (anchors.length === 0) throw new Error(`refine: no exported or imported identifier named: ${spec}`)

    const files = new Set<string>()
    for (const node of anchors) {
        files.add(displayPath(node.getSourceFile().getFilePath()))
        for (const ref of node.findReferencesAsNodes()) {
            files.add(displayPath(ref.getSourceFile().getFilePath()))
        }
    }
    return files
}

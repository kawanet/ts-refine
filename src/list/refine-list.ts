// `list`: per-file export / usage snapshot. For each in-project file (external
// library declarations aside, .d.ts included) it counts exported declarations,
// how many of those have no external reference (unused), and how many other
// files import it. The optional ListFilters narrow the result here, so callers
// receive exactly the cleanup candidates they asked for.
//
// The export/unused counting mirrors the unused-exports report; the two
// will be unified in a later pass (that report is left untouched for now).

import {Node} from "ts-morph"
import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {resolveProject} from "../lib/init-project.ts"
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

    const result = filters ? entries.filter((e) => keepEntry(e, filters)) : entries
    log.write(`list: ${result.length} files\n`)
    return result
}

// AND semantics: an entry survives only when it matches every filter that is
// set. With no filter active every entry passes.
function keepEntry(e: TSR.ListEntry, f: TSR.ListFilters): boolean {
    if (f.noExports && e.exports !== 0) return false
    if (f.noImporters && e.importers !== 0) return false
    if (f.unusedExports && e.unused === 0) return false
    return true
}

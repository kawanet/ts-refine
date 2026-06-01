// `list`: per-file export / usage snapshot. For each in-project file (external
// library declarations aside, .d.ts included) it counts exported declarations,
// how many of those have no external reference (unused), and how many other
// files import it. The
// full set is returned unfiltered so later commands can reuse it; the CLI
// applies the --no-exports / --no-importers / --unused-exports filters.
//
// The export/unused counting mirrors the unused-exports report; the two
// will be unified in a later pass (that report is left untouched for now).

import {Node} from "ts-morph"
import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {resolveProject} from "../lib/init-project.ts"
import {displayPath, selectSourceFiles} from "../lib/source-files.ts"

export const refineList: typeof declared.refineList = async (opts) => {
    const {paths, log} = opts
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
    log.write(`list: ${entries.length} files\n`)
    return entries
}

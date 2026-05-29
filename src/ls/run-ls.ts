// `ls`: per-file export / usage snapshot. For each file (in scope, .d.ts
// excluded) it counts exported declarations, how many of those have no
// external reference (unused), and how many other files import it. The
// full set is returned unfiltered so later commands can reuse it; the CLI
// applies the --no-exports / --no-importers / --unused-exports filters.
//
// The export/unused counting mirrors the unused-exports report; the two
// will be unified in a later pass (that report is left untouched for now).

import type * as declared from "@kawanet/ts-survey"
import {Node} from "ts-morph"

import {displayPath, selectSourceFiles} from "../lib/source-files.ts"

export const runLs: typeof declared.runLs = async (project, {paths}) => {
    const sourceFiles = selectSourceFiles(project, {paths}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    const entries: declared.LsEntry[] = []
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

        // Importers = other in-project files that reference this one. Skip
        // .d.ts referrers to match the file scope used everywhere else.
        const importers = sf.getReferencingSourceFiles().filter((r) => r !== sf && !r.getFilePath().endsWith(".d.ts")).length

        entries.push({file: displayPath(sf.getFilePath()), exports, unused, importers})
    }

    entries.sort((a, b) => a.file.localeCompare(b.file))
    console.error(`ls: ${entries.length} files`)
    return entries
}

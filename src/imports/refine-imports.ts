// `imports` command: organize each file's import/export block (sort, merge,
// drop unused, settle type-only markers) without reformatting the surrounding
// text. It is the organize pass on its own — `format` reformats but no longer
// touches imports — so a project keeps its existing style and shifts the least.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {formatSettingsForFile} from "../lib/format-settings.ts"
import {applyOrganizeImports} from "../lib/organize-imports.ts"
import {selectSourceFiles} from "../lib/source-files.ts"

export const refineImports: typeof declared.refineImports = async (opts) => {
    const {dryRun, paths, log} = opts
    const project = resolveProject(opts)

    const sourceFiles = selectSourceFiles(project, {paths})

    // Absolute paths of the files whose import block changed; returned so a
    // caller can summarize a dry-run without re-reading the files.
    const touched: string[] = []
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        // Survey this file alone (imports-only) so it organizes in its own
        // existing style and the project's formatting barely shifts.
        const settings = await formatSettingsForFile(sf)
        applyOrganizeImports(sf, settings)

        const after = sf.getFullText()
        if (before === after) continue

        touched.push(filePath)
        if (dryRun) {
            logging(log, `would update: ${filePath}`)
        } else {
            await fs.writeFile(filePath, after)
            logging(log, `updated: ${filePath}`)
        }
    }

    const verb = dryRun ? "would change" : "changed"
    logging(log, `imports: ${verb} ${touched.length} / ${totalCount} files`)

    return {touched}
}

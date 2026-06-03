// `imports` command: organize each file's import/export block (sort, merge,
// drop unused, settle type-only markers) without reformatting the surrounding
// text. It is the organize pass on its own — `format` reformats but no longer
// touches imports — so a project keeps its existing style and shifts the least.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {applyOrganizeImports} from "../lib/organize-imports.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {perFileSettings} from "../recommend/format-settings.ts"

export const refineImports: typeof declared.refineImports = async (opts) => {
    const {dryRun, paths, format, log} = opts
    const project = resolveProject(opts)

    // One style for the whole run, or a per-file resolver (the CLI surveys each
    // file alone so it keeps its own conventions). imports never repaths files,
    // so the current path is enough to resolve a file's settings.
    const resolveSettings = perFileSettings(format)

    const sourceFiles = selectSourceFiles(project, {paths})

    // Absolute paths of the files whose import block changed; returned so a
    // caller can summarize a dry-run without re-reading the files.
    const touched: string[] = []
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        const {formatSettings} = await resolveSettings(filePath)
        applyOrganizeImports(sf, formatSettings)

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

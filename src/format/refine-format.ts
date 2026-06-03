// `format` command: apply a resolved FormatStyle → LS formatter. It reformats
// the surrounding text only; organizing imports is the separate `imports`
// command. The caller merges the survey recommendation with CLI overrides;
// refineFormat just applies the result.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {normalizeNewLines, perFileSettings} from "../lib/format-settings.ts"
import {selectSourceFiles} from "../lib/source-files.ts"

export const refineFormat: typeof declared.refineFormat = async (opts) => {
    const {dryRun, paths, format, log} = opts
    const project = resolveProject(opts)

    // `format` is one style for everyone, or a per-file resolver. A static style
    // is converted once here; a resolver is surveyed per file inside the loop.
    const resolveSettings = perFileSettings(format)

    const sourceFiles = selectSourceFiles(project, {paths})

    // Absolute paths of the files whose text changed; returned so callers
    // (e.g. `--check`) can act on whether anything would be rewritten.
    const touched: string[] = []
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        // Resolve this file's settings (per-file under a resolver; the shared
        // precomputed value otherwise). format does not repath files, so the
        // current path is enough.
        const {settings, newLine} = await resolveSettings(filePath)

        sf.formatText(settings)

        // LS `newLineCharacter` only governs inserted text; existing
        // terminators are normalized here. Push the result back into the
        // SourceFile so in-memory state matches what gets written.
        let after = sf.getFullText()
        if (newLine !== undefined) {
            const normalized = normalizeNewLines(after, newLine)
            if (normalized !== after) {
                sf.replaceWithText(normalized)
                after = normalized
            }
        }

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
    logging(log, `format: ${verb} ${touched.length} / ${totalCount} files`)

    return {touched}
}

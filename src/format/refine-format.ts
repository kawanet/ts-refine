// `format` command: apply a resolved FormatStyle → LS formatter + organizeImports.
// Order is formatText → organizeImports; the same FormatCodeSettings
// feeds both so the rebuilt import block matches the file. The caller merges the
// survey recommendation with CLI overrides; refineFormat just applies the result.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {applyOrganizeImports} from "../lib/organize-imports.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {formatStyleToSettings, normalizeNewLines} from "../recommend/format-settings.ts"

export const refineFormat: typeof declared.refineFormat = async (opts) => {
    const {dryRun, paths, format, organizeImports, log} = opts
    const project = resolveProject(opts)

    // organizeImports is a behavior flag, not a surveyed style: default "on"
    // re-sorts after formatting, "off" skips the re-sort, "only" organizes
    // without reformatting the surrounding text.
    const organize = organizeImports !== "off"
    const organizeOnly = organizeImports === "only"

    // `format` is one style for everyone, or a per-file resolver (the `only`
    // CLI path). A static style is converted once here; a resolver is surveyed
    // per file inside the loop.
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
        const {formatSettings, newLineNormalize} = await resolveSettings(filePath)

        // `only` leaves the surrounding text to another formatter and runs just
        // the organize pass below.
        if (!organizeOnly) sf.formatText(formatSettings)

        // Same settings handed in so the rebuilt import block doesn't
        // drift from the just-formatted surrounding file.
        if (organize) {
            applyOrganizeImports(sf, formatSettings)
        }

        // LS `newLineCharacter` only governs inserted text; existing
        // terminators are normalized here. Push the result back into the
        // SourceFile so in-memory state matches what gets written.
        let after = sf.getFullText()
        if (!organizeOnly && newLineNormalize !== undefined) {
            const normalized = normalizeNewLines(after, newLineNormalize)
            if (normalized !== after) {
                sf.replaceWithText(normalized)
                after = normalized
            }
        }

        if (before === after) continue

        touched.push(filePath)
        if (dryRun) {
            log.write(`would update: ${filePath}\n`)
        } else {
            await fs.writeFile(filePath, after)
            log.write(`updated: ${filePath}\n`)
        }
    }

    const verb = dryRun ? "would change" : "changed"
    log.write(`format: ${verb} ${touched.length} / ${totalCount} files\n`)

    return {touched}
}

// Resolve a file's formatter settings: surveyed per file under a resolver, or
// converted once for a single style so the common (static) case is not
// recomputed for every file.
function perFileSettings(format: TSR.FormatOpts["format"]) {
    if (typeof format === "function") return (file: string) => format(file).then(formatStyleToSettings)
    const settings = formatStyleToSettings(format)
    return (_file: string) => Promise.resolve(settings)
}

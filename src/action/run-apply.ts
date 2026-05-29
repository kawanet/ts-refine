// `format` command: resolve report + overrides → LS formatter + organizeImports.
// Order is formatText → organizeImports; the same FormatCodeSettings
// feeds both so the rebuilt import block matches the file.

import type * as declared from "@kawanet/ts-survey"
import fs from "node:fs/promises"

import {mergeFormatOptions, normalizeNewLines, overridesToFormatOptions, reportToFormatOptions, resolveSettings} from "../lib/format-options.ts"
import {selectSourceFiles} from "../lib/source-files.ts"

export const runApply: typeof declared.runApply = async (project, opts) => {
    const {dryRun, absIncludes, absExcludes, report, ...overrides} = opts
    // Report recommendation is the base; CLI overrides win per field.
    const options = mergeFormatOptions(reportToFormatOptions(report), overridesToFormatOptions(overrides))
    const resolved = resolveSettings(options)

    // `cr` is dropped from FormatOptions, so the diagnostic is sourced from
    // the report here: recommended but unapplied unless the user overrode it.
    if (overrides.newLine === undefined && report.newLine?.newLine === "cr") {
        console.error("note: report recommends CR-only newlines; not applied (LS formatter supports LF/CRLF only)")
    }

    // .d.ts excluded — same scope every report uses for measurement.
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    let changedCount = 0
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        sf.formatText(resolved.formatSettings)
        // Same settings handed in so the rebuilt import block doesn't
        // drift from the just-formatted surrounding file.
        if (resolved.organizeImports) {
            sf.organizeImports(resolved.formatSettings)
        }

        // LS `newLineCharacter` only governs inserted text; existing
        // terminators are normalized here. Push the result back into the
        // SourceFile so in-memory state matches what gets written.
        let after = sf.getFullText()
        if (resolved.newLineNormalize !== undefined) {
            const normalized = normalizeNewLines(after, resolved.newLineNormalize)
            if (normalized !== after) {
                sf.replaceWithText(normalized)
                after = normalized
            }
        }

        if (before === after) continue

        changedCount++
        if (dryRun) {
            console.log(`would update: ${filePath}`)
        } else {
            await fs.writeFile(filePath, after)
            console.log(`updated: ${filePath}`)
        }
    }

    const verb = dryRun ? "would change" : "changed"
    console.error(`apply: ${verb} ${changedCount} / ${totalCount} files`)
}

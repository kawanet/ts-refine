// `format` command: resolve report + overrides → LS formatter + organizeImports.
// Order is formatText → organizeImports; the same FormatCodeSettings
// feeds both so the rebuilt import block matches the file.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import {selectSourceFiles} from "../lib/source-files.ts"
import {applyTypeOnlyFixes} from "../lib/type-only-fixes.ts"
import {mergeFormatOptions, normalizeNewLines, overridesToFormatOptions, reportToFormatOptions, resolveSettings} from "../recommend/format-options.ts"

export const refineFormat: typeof declared.refineFormat = async (project, opts) => {
    const {dryRun, paths, report, log, ...overrides} = opts
    // Report recommendation is the base; CLI overrides win per field.
    const options = mergeFormatOptions(reportToFormatOptions(report), overridesToFormatOptions(overrides))
    const resolved = resolveSettings(options)

    // `cr` is dropped from FormatOptions, so the diagnostic is sourced from
    // the report here: recommended but unapplied unless the user overrode it.
    if (overrides.newLine === undefined && report.newLine?.newLine === "cr") {
        log.write("note: report recommends CR-only newlines; not applied (LS formatter supports LF/CRLF only)\n")
    }

    // .d.ts excluded — same scope every report uses for measurement.
    const sourceFiles = selectSourceFiles(project, {paths}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    // Absolute paths of the files whose text changed; returned so callers
    // (e.g. `--check`) can act on whether anything would be rewritten.
    const touched: string[] = []
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        sf.formatText(resolved.formatSettings)
        // Same settings handed in so the rebuilt import block doesn't
        // drift from the just-formatted surrounding file.
        if (resolved.organizeImports) {
            // Same bundle as remove-unused: type-only markers settle before
            // the sort so organizeImports orders the rewritten block.
            applyTypeOnlyFixes(sf, resolved.formatSettings)
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

        touched.push(filePath)
        if (dryRun) {
            log.write(`would update: ${filePath}\n`)
        } else {
            await fs.writeFile(filePath, after)
            log.write(`updated: ${filePath}\n`)
        }
    }

    const verb = dryRun ? "would change" : "changed"
    log.write(`apply: ${verb} ${touched.length} / ${totalCount} files\n`)

    return {touched}
}

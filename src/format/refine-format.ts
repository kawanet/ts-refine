// `format` command: apply a resolved FormatStyle → LS formatter. It reformats
// the surrounding text only; organizing imports is the separate `imports`
// command. The caller merges the survey recommendation with CLI overrides;
// refineFormat just applies the result.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {formatStyleToSettings, normalizeNewLines} from "../lib/format-settings.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {applyMemberDelimiter} from "./apply-member-delimiter.ts"
import {applySingleLineTypeLiteralTail} from "./apply-single-line-type-literal.ts"
import {applyTrailingComma} from "./apply-trailing-comma.ts"

export const refineFormat: typeof declared.refineFormat = async (opts) => {
    const {dryRun, paths, format, log} = opts
    const project = resolveProject(opts)

    // `format` is a single style applied to every file; convert it once.
    const settings = formatStyleToSettings(format)
    const newLine = settings.newLineCharacter

    const sourceFiles = selectSourceFiles(project, {paths})

    // Absolute paths of the files whose text changed; returned so callers
    // (e.g. `--check`) can act on whether anything would be rewritten.
    const touched: string[] = []
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        // The survey navigated this file and left ts-morph node wrappers cached.
        // formatText's incremental reparse diffs the new tree against those
        // wrappers and throws when a structural edit (e.g. removing a trailing
        // `;`) changes a child count, so drop them and reparse from clean text.
        sf.forgetDescendants()
        sf.formatText(settings)

        // The LS formatter can't set interface/class member delimiter (and
        // can't emit commas); apply the surveyed style on the formatted AST.
        if (format.memberDelimiter != null) applyMemberDelimiter(sf, format.memberDelimiter)

        // Prettier keeps the last member of a single-line type literal bare
        // even when the surrounding type alias receives a statement `;`.
        if (format.semi === "on") applySingleLineTypeLiteralTail(sf)

        // The LS formatter has no trailing-comma control either; apply it too.
        if (format.trailingComma != null) applyTrailingComma(sf, format.trailingComma)

        // LS `newLineCharacter` only governs inserted text; existing
        // terminators are normalized here to the same target. Push the result
        // back into the SourceFile so in-memory state matches what gets written.
        let after = sf.getFullText()
        if (newLine === "\n" || newLine === "\r\n") {
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

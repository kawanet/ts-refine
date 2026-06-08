// `format` command: apply a resolved FormatStyle → LS formatter. It reformats
// the surrounding text only; organizing imports is the separate `imports`
// command. The caller merges the survey recommendation with CLI overrides;
// refineFormat just applies the result.

import fs from "node:fs/promises"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {assertNoLoneCr} from "../lib/assert-no-lone-cr.ts"
import {formatStyleToSettings, normalizeNewLines} from "../lib/format-settings.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {applyAsiGuard} from "./apply-asi-guard.ts"
import {applyMemberDelimiter} from "./apply-member-delimiter.ts"
import {applySingleLineTypeLiteralTail} from "./apply-single-line-type-literal.ts"
import {applyTrailingComma} from "./apply-trailing-comma.ts"
import {applyTypeLiteralBracketSpacing} from "./apply-type-literal-bracket-spacing.ts"

export const refineFormat: typeof declared.refineFormat = async (opts) => {
    const {dryRun, paths, style, log} = opts
    const project = resolveProject(opts)

    // `format` is a single style applied to every file; convert it once.
    const settings = formatStyleToSettings(style)
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
        assertNoLoneCr(before, filePath)

        // The survey navigated this file and left bridge node wrappers cached.
        // formatText's incremental reparse diffs the new tree against those
        // wrappers and throws when a structural edit (e.g. removing a trailing
        // `;`) changes a child count, so drop them and reparse from clean text.
        sf.forgetDescendants()
        sf.formatText(settings)

        // formatText's semicolons diverge from Prettier on two narrow points,
        // mutually exclusive by semi value; correct whichever applies first.
        // `off`: restore the `;(` ASI guard the LS re-spaced to `; (`.
        if (style.semi === "off") applyAsiGuard(sf)
        // `on`: the LS appends a `;` to a single-line type literal's last
        // member that Prettier keeps bare; trim only that tail.
        if (style.semi === "on") applySingleLineTypeLiteralTail(sf)

        // member-delimiter and trailing-comma are axes the LS can't express
        // (it can't emit a comma delimiter at all); reassert each afterward.
        // Type-literal brace spacing is reasserted last because the LS can leave
        // index-signature literals asymmetric when bracketSpacing is off.
        if (style.memberDelimiter != null) applyMemberDelimiter(sf, style.memberDelimiter)
        if (style.trailingComma != null) applyTrailingComma(sf, style.trailingComma)
        if (style.bracketSpacing != null) applyTypeLiteralBracketSpacing(sf, style.bracketSpacing)

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

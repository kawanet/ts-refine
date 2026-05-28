// --semicolons on|off: rewrite trailing `;` on every ASI-eligible
// statement file-wide. The "off" side guards against ASI hazards by
// checking the next non-trivia code character; it mirrors the TS LS
// rule `isSemicolonDeletionContext` (formatting/rules.ts) closely
// enough to avoid the common pitfalls.

import type * as declared from "@kawanet/ts-survey"
import fs from "node:fs/promises"

import {selectSourceFiles} from "../lib/source-files.ts"
import {isSemiEligibleStatement} from "../lib/statement-kinds.ts"

// Tokens that, when starting the next statement on a separate line, would
// fuse with the previous expression under ASI if its trailing `;` were
// removed. Matches the TS LS deletion-context list.
const ASI_HAZARD_CHARS = new Set(["[", "(", "+", "-", "/", "`", ".", ","])

export const runSemicolons: typeof declared.runSemicolons = async (project, {dryRun, absIncludes, absExcludes, semicolons}) => {
    // Exclude .d.ts to match the semicolons report scope.
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    let changedCount = 0
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()

        // Collect primitive (end, hasSemi) tuples rather than node refs so that
        // later replaceText calls do not invalidate held references via ts-morph
        // AST recomputation. Sort by end descending so each edit always sits
        // after every offset still to be touched. Note: forEachDescendant visits
        // parent before child, so a nested layout (describe → it → assert) yields
        // an array where the outer statement has a larger end than the inner ones
        // even though it was pushed first; plain array-reverse is not enough.
        const targets: {end: number; hasSemi: boolean}[] = []
        sf.forEachDescendant((node) => {
            if (!isSemiEligibleStatement(node)) return
            targets.push({end: node.getEnd(), hasSemi: node.getText().endsWith(";")})
        })
        targets.sort((a, b) => b.end - a.end)

        for (const t of targets) {
            if (semicolons === "off" && t.hasSemi) {
                // Keep `;` when its removal would change ASI semantics, observed on
                // the current text (covers the case where a later statement already
                // had its `;` removed in this same pass).
                if (hasAsiHazardAfter(sf.getFullText(), t.end)) continue
                sf.replaceText([t.end - 1, t.end], "")
            } else if (semicolons === "on" && !t.hasSemi) {
                sf.replaceText([t.end, t.end], ";")
            }
        }

        const after = sf.getFullText()
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
    console.error(`semicolons ${semicolons}: ${verb} ${changedCount} / ${totalCount} files`)
}

// Scan forward from fromPos through whitespace and comments. The first
// code character decides: same-line allows only `}` (otherwise hazardous,
// since two statements on one line would fuse); across a newline, only the
// hazard set is risky; EOF is always safe.
export function hasAsiHazardAfter(text: string, fromPos: number): boolean {
    let i = fromPos
    let crossedNewline = false
    while (i < text.length) {
        const c = text.charCodeAt(i)
        if (c === 0x20 || c === 0x09 || c === 0x0d) {
            i++
            continue
        }
        if (c === 0x0a) {
            crossedNewline = true
            i++
            continue
        }
        if (c === 0x2f && text.charCodeAt(i + 1) === 0x2f) {
            const eol = text.indexOf("\n", i + 2)
            if (eol === -1) return false
            crossedNewline = true
            i = eol + 1
            continue
        }
        if (c === 0x2f && text.charCodeAt(i + 1) === 0x2a) {
            const end = text.indexOf("*/", i + 2)
            if (end === -1) return false
            if (text.lastIndexOf("\n", end) >= i) crossedNewline = true
            i = end + 2
            continue
        }
        const ch = text[i]
        if (!crossedNewline) return ch !== "}"
        return ASI_HAZARD_CHARS.has(ch)
    }
    return false
}

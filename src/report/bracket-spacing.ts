// --report bracket-spacing: classify object literals and destructuring
// patterns by whether the inner content is padded with a space inside
// the braces (`{ a: 1 }` vs `{a: 1}`). Picks the per-file primary, then
// the file-count majority. Maps to FormatCodeSettings'
// insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces and Prettier's
// `bracketSpacing`.

import type {RunBracketSpacingOpts} from "@kawanet/ts-survey"
import type {Project} from "ts-morph"
import {Node} from "ts-morph"

import {displayPath, selectSourceFiles} from "../lib/source-files.ts"
import type {ReportOpts} from "../lib/types.ts"

type Style = "on" | "off"

const DISPLAY_ORDER: Style[] = ["on", "off"]

const STYLE_LABEL: Record<Style, string> = {
    on: "`{ x }`",
    off: "`{x}`",
}

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportBracketSpacing(project: Project, {stream, absIncludes, absExcludes}: ReportOpts): Promise<Partial<RunBracketSpacingOpts>> {
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    type PerFile = {path: string; counts: Map<Style, number>; primary: Style}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const counts = new Map<Style, number>()
        sf.forEachDescendant((node) => {
            if (!Node.isObjectLiteralExpression(node) && !Node.isObjectBindingPattern(node)) return
            const style = classifyBraces(node.getText())
            if (style === null) return
            counts.set(style, (counts.get(style) ?? 0) + 1)
        })
        if (counts.size === 0) continue
        perFile.push({path: displayPath(sf.getFilePath()), counts, primary: pickPrimary(counts)})
    }

    const buckets = new Map<Style, Bucket>()
    for (const f of perFile) {
        const linesAtPrimary = f.counts.get(f.primary) ?? 0
        let b = buckets.get(f.primary)
        if (!b) {
            b = {lines: 0, files: 0, topPath: f.path, topLines: 0}
            buckets.set(f.primary, b)
        }
        b.lines += linesAtPrimary
        b.files++
        if (linesAtPrimary > b.topLines || (linesAtPrimary === b.topLines && f.path.localeCompare(b.topPath) < 0)) {
            b.topPath = f.path
            b.topLines = linesAtPrimary
        }
    }

    let recommend: Style | undefined
    let maxFiles = 0
    for (const k of DISPLAY_ORDER) {
        const fc = buckets.get(k)?.files ?? 0
        if (fc > maxFiles) {
            maxFiles = fc
            recommend = k
        } else if (fc === maxFiles && fc > 0 && recommend !== k) {
            recommend = undefined
        }
    }

    const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

    stream.write("### bracket-spacing\n")
    stream.write("\n")
    stream.write("| style | nodes | files | example |\n")
    stream.write("| --- | --- | --- | --- |\n")
    for (const k of DISPLAY_ORDER) {
        const b = buckets.get(k)
        if (!b) continue
        stream.write(`| ${STYLE_LABEL[k]} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
    }
    stream.write(`| total | ${totalLines} | ${perFile.length} | |\n`)
    stream.write("\n")
    console.error(`report bracket-spacing: ${perFile.length} files counted / ${sourceFiles.length} files total`)
    return recommend !== undefined ? {bracketSpacing: recommend} : {}
}

// Returns the inner-padding style for a brace pair, or null if the node
// shape can't speak to the bracketSpacing convention. Empty `{}`,
// whitespace-only `{ }`, and multi-line forms are all excluded — none
// of them express a `{ a }` vs `{a}` preference.
function classifyBraces(text: string): Style | null {
    if (text.length < 2 || text[0] !== "{" || text[text.length - 1] !== "}") return null
    const inner = text.slice(1, -1)
    if (inner.trim().length === 0) return null
    // CR-only files (no LF) are rare but real; the new-line report
    // already classifies them, so the multi-line skip matches.
    if (/[\r\n]/.test(inner)) return null
    return inner.startsWith(" ") && inner.endsWith(" ") ? "on" : "off"
}

// Primary = style with the highest count in this file. Ties follow the
// display order (on > off), so a mixed-but-balanced file lands under
// the explicit-spacing convention, matching Prettier's default.
function pickPrimary(counts: Map<Style, number>): Style {
    let best: Style = "on"
    let bestCount = -1
    for (const k of DISPLAY_ORDER) {
        const c = counts.get(k) ?? 0
        if (c > bestCount) {
            bestCount = c
            best = k
        }
    }
    return best
}

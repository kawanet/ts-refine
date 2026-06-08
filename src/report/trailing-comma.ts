// report trailing-comma: classify multi-line comma-separated lists by whether
// they carry a trailing comma. Scope mirrors the apply pass (listOf): array /
// object / call / param / enum / tuple / named-import lists, excluding the
// angle-bracket and interface/type/class member lists it leaves untouched.
// Single-line lists never vote — a trailing comma there is not a layout choice
// the convention speaks to — so only the author's multi-line lists are counted.

import type {Node} from "ts-morph"
import type {TSR} from "ts-refine"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import {logging} from "../common/logging.ts"
import {isSpreadOrRestElement, listOf, trailingCommaToken} from "../format/apply-trailing-comma.ts"
import {displayPath} from "../lib/source-files.ts"
import {hasLineBreakBetween} from "../lib/text-ranges.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"

type Style = "on" | "off"

const DISPLAY_ORDER: Style[] = ["on", "off"]

const STYLE_LABEL: Record<Style, string> = {
    on: "trailing `,`",
    off: "no trailing `,`",
}

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

// The trailing-comma vote of one list, or null when it can't speak to the
// convention: empty, single-line, or a spread/rest last element (where adding
// a comma would be a syntax error — see the apply pass).
function classify(text: string, node: Node): Style | null {
    const list = listOf(node)
    if (list == null || list.elements.length === 0) return null
    const last = list.elements[list.elements.length - 1]
    if (isSpreadOrRestElement(last)) return null
    const multiline = hasLineBreakBetween(text, last.getEnd(), list.close.getStart())
    if (!multiline) return null
    return trailingCommaToken(last) != null ? "on" : "off"
}

export async function runReportTrailingComma({sourceFiles, output, log, importsOnly}: ReportRunOpts): Promise<Partial<TSR.TrailingCommaReport>> {
    type PerFile = {path: string; counts: Map<Style, number>; primary: Style}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const text = sf.getFullText()
        const counts = new Map<Style, number>()
        const visit = (node: Node) => {
            const style = classify(text, node)
            if (style == null) return
            counts.set(style, (counts.get(style) ?? 0) + 1)
        }
        // importsOnly: organizeImports only rewrites the import/export
        // statements, so the named-binding lists inside them are the only
        // trailing commas it can touch.
        if (importsOnly) {
            sf.getImportDeclarations().forEach((d) => d.forEachDescendant(visit))
            sf.getExportDeclarations().forEach((d) => d.forEachDescendant(visit))
        } else {
            sf.forEachDescendant(visit)
        }
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

    const recommend = pickRecommendByFiles(DISPLAY_ORDER, (k) => buckets.get(k))
    const report: TSR.TrailingCommaReport = recommend ? {trailingComma: recommend} : {}

    // The Markdown table is for display only; skip it when no sink is given —
    // the recommendation above is the result.
    if (output) {
        const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

        const heading = getTsRefineFormat({trailingComma: report}) || "(trailing-comma)"
        output.write(`### ${heading}\n`)
        output.write("\n")
        output.write("| style | lists | files | example |\n")
        output.write("| --- | --- | --- | --- |\n")
        for (const k of DISPLAY_ORDER) {
            const b = buckets.get(k)

            // Both styles always get a row (0 when absent) so the two-way
            // comparison is always visible at a glance.
            if (b) {
                output.write(`| ${STYLE_LABEL[k]} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
            } else {
                output.write(`| ${STYLE_LABEL[k]} | 0 | 0 |  |\n`)
            }
        }
        output.write(`| total | ${totalLines} | ${perFile.length} |  |\n`)
        output.write("\n")
    }
    logging(log, `report trailing-comma: ${perFile.length} files counted / ${sourceFiles.length} files total`)

    return report
}

// Primary = style with the highest count in this file. Ties follow the display
// order (on > off), so a mixed-but-balanced file lands under the trailing-comma
// convention, matching Prettier's `all` default.
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

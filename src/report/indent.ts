// report indent: classify each file by its primary leading width (the
// one with the most lines in that file), then bucket files by that
// primary. The recommendation is the primary the most files use — the
// same "file-count majority" model the semicolons report uses.
//
// The per-file detection itself still hands back the full width → line
// map (see ./detect-indent) so callers can introspect the distribution;
// the report just picks the per-file mode out of that map.

import type {TSR} from "ts-refine"
import {logging} from "../lib/logging.ts"
import {displayPath} from "../lib/source-files.ts"
import {pickRecommendByFiles} from "../recommend/pick-recommend.ts"
import {detectIndent, type IndentCounts, type IndentWidth, primaryIndentWidth} from "./detect-indent.ts"
import type {ReportRunOpts} from "./types.ts"

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportIndent({sourceFiles, output, log}: ReportRunOpts): Promise<Partial<TSR.IndentOpts>> {
    // Per-file: detect leading-width distribution, then collapse to one
    // "primary" width (the line-count mode). Files with no leading
    // whitespace at all are excluded.
    type PerFile = {path: string; counts: IndentCounts; primary: IndentWidth}
    const perFile: PerFile[] = []
    for (const sf of sourceFiles) {
        const counts = detectIndent(sf.getFullText())
        if (counts.size === 0) continue
        const primary = primaryIndentWidth(counts)
        if (primary === undefined) continue
        perFile.push({path: displayPath(sf.getFilePath()), counts, primary})
    }

    // Group files by primary. The "lines" column reports how many lines
    // each file contributed AT the primary width — i.e., the strength of
    // the primary classification.
    const buckets = new Map<IndentWidth, Bucket>()
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

    // Numeric widths ascending (present only), then always a "tab" row —
    // shown as 0 when absent so the table layout stays predictable.
    const numerics = [...buckets.keys()].filter((k): k is number => typeof k === "number").sort((a, b) => a - b)
    const widths: IndentWidth[] = [...numerics, "tab"]

    // Recommendation: file-count majority, with line count breaking ties.
    // An empty "tab" bucket is skipped inside pickRecommendByFiles.
    const recommendWidth = pickRecommendByFiles(widths, (w) => buckets.get(w))

    // The Markdown table is for display only; skip it (and its formatting)
    // when no output sink is given — the recommendation above is the result.
    if (output) {
        const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

        output.write("### indent\n")
        output.write("\n")
        output.write("| indent | lines | files | example |\n")
        output.write("| --- | --- | --- | --- |\n")
        for (const w of widths) {
            const b = buckets.get(w)
            if (b) {
                output.write(`| ${w} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
            } else {
                output.write(`| ${w} | 0 | 0 ||\n`)
            }
        }
        output.write(`| total | ${totalLines} | ${perFile.length} | |\n`)
        output.write("\n")
    }
    logging(log, `report indent: ${perFile.length} files counted / ${sourceFiles.length} files total`)

    // The recommendation is rendered in the `## recommendation` section
    // at the end of the Markdown survey. Both a numeric width and a "tab"
    // majority are actionable (LS convertTabsToSpaces / Prettier useTabs),
    // so either is returned; only a tie (undefined) yields empty.
    return recommendWidth !== undefined ? {width: recommendWidth} : {}
}

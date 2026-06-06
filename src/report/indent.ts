// report indent: classify each file by its primary leading width (the
// one with the most lines in that file), then bucket files by that
// primary. The recommendation is the primary the most files use — the
// same "file-count majority" model the semicolons report uses.
//
// The per-file detection itself still hands back the full width → line
// map (see ./detect-indent) so callers can introspect the distribution;
// the report just picks the per-file mode out of that map.

import type {TSR} from "ts-refine"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import {logging} from "../common/logging.ts"
import {displayPath} from "../lib/source-files.ts"
import {detectIndent, type IndentCounts, type IndentWidth, primaryIndentWidth} from "./detect-indent.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportIndent({sourceFiles, output, log}: ReportRunOpts): Promise<Partial<TSR.IndentReport>> {
    // Per-file: detect leading-width distribution, then collapse to one
    // "primary" width (the line-count mode). Files with no leading
    // whitespace at all are excluded.
    type PerFile = {path: string; counts: IndentCounts; primary: IndentWidth}
    const perFile: PerFile[] = []
    for (const sf of sourceFiles) {
        const counts = detectIndent(sf.getFullText())
        if (counts.size === 0) continue
        const primary = primaryIndentWidth(counts)
        if (primary == null) continue
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
    const report: TSR.IndentReport = recommendWidth ? {width: recommendWidth} : {}

    // The Markdown table is for display only; skip it (and its formatting)
    // when no output sink is given — the recommendation above is the result.
    if (output) {
        const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

        const heading = getTsRefineFormat({indent: report}) || "(indent)"
        output.write(`### ${heading}\n`)
        output.write("\n")
        output.write("| indent | lines | files | example |\n")
        output.write("| --- | --- | --- | --- |\n")
        for (const w of widths) {
            const b = buckets.get(w)
            if (b) {
                output.write(`| ${w} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
            } else {
                output.write(`| ${w} | 0 | 0 |  |\n`)
            }
        }
        output.write(`| total | ${totalLines} | ${perFile.length} |  |\n`)
        output.write("\n")
    }
    logging(log, `report indent: ${perFile.length} files counted / ${sourceFiles.length} files total`)

    return report
}

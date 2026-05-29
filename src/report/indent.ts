// --report indent: classify each file by its primary leading width (the
// one with the most lines in that file), then bucket files by that
// primary. The recommendation is the primary the most files use — the
// same "file-count majority" model the semicolons report uses.
//
// The per-file detection itself still hands back the full width → line
// map (see lib/detect-indent) so callers can introspect the distribution;
// the report just picks the per-file mode out of that map.

import type {RunIndentOpts} from "@kawanet/ts-survey"
import type {Project} from "ts-morph"

import {detectIndent, type IndentCounts, type IndentWidth, primaryIndentWidth} from "../lib/detect-indent.ts"
import {pickRecommendByFiles} from "../lib/pick-recommend.ts"
import {displayPath, selectSourceFiles} from "../lib/source-files.ts"
import type {ReportOpts} from "./types.ts"

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportIndent(project: Project, {stream, absIncludes, absExcludes}: ReportOpts): Promise<Partial<RunIndentOpts>> {
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

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

    const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

    stream.write("### indent\n")
    stream.write("\n")
    stream.write("| indent | lines | files | example |\n")
    stream.write("| --- | --- | --- | --- |\n")
    for (const w of widths) {
        const b = buckets.get(w)
        if (b) {
            stream.write(`| ${w} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
        } else {
            stream.write(`| ${w} | 0 | 0 ||\n`)
        }
    }
    stream.write(`| total | ${totalLines} | ${perFile.length} | |\n`)
    stream.write("\n")
    console.error(`report indent: ${perFile.length} files counted / ${sourceFiles.length} files total`)
    // The recommendation is rendered in the `## recommendation` section
    // at the end of the Markdown survey. Both a numeric width and a "tab"
    // majority are actionable (LS convertTabsToSpaces / Prettier useTabs),
    // so either is returned; only a tie (undefined) yields empty.
    return recommendWidth !== undefined ? {width: recommendWidth} : {}
}

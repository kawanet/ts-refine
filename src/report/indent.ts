// --report indent: classify each file by its primary leading width (the
// one with the most lines in that file), then bucket files by that
// primary. The recommendation is the primary the most files use — the
// same "file-count majority" model the semicolons report uses.
//
// The per-file detection itself still hands back the full width → line
// map (see lib/detect-indent) so callers can introspect the distribution;
// the report just picks the per-file mode out of that map.

import type {Project} from "ts-morph"

import {detectIndent, type IndentCounts, type IndentWidth} from "../lib/detect-indent.ts"
import {writeRecommendation} from "../lib/recommendation.ts"
import {displayPath, selectSourceFiles} from "../lib/source-files.ts"
import type {ReportOpts} from "./unused-exports.ts"

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportIndent(project: Project, {stream, absIncludes, absExcludes}: ReportOpts): Promise<void> {
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    // Per-file: detect leading-width distribution, then collapse to one
    // "primary" width (the line-count mode). Files with no leading
    // whitespace at all are excluded.
    type PerFile = {path: string; counts: IndentCounts; primary: IndentWidth}
    const perFile: PerFile[] = []
    for (const sf of sourceFiles) {
        const counts = detectIndent(sf.getFullText())
        if (counts.size === 0) continue
        const primary = primaryWidth(counts)
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

    // Numeric widths ascending, then "tab" last.
    const numerics = [...buckets.keys()].filter((k): k is number => typeof k === "number").sort((a, b) => a - b)
    const widths: IndentWidth[] = [...numerics]
    if (buckets.has("tab")) widths.push("tab")

    // Recommendation: primary used by the most files. Strict ties produce
    // no recommendation (the choice would be arbitrary).
    let recommendWidth: IndentWidth | undefined
    let maxFiles = 0
    for (const w of widths) {
        const fc = buckets.get(w)!.files
        if (fc > maxFiles) {
            maxFiles = fc
            recommendWidth = w
        } else if (fc === maxFiles && w !== recommendWidth) {
            recommendWidth = undefined
        }
    }

    const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

    stream.write("### indent\n")
    stream.write("\n")
    stream.write("| indent | lines | files | example |\n")
    stream.write("| --- | --- | --- | --- |\n")
    for (const w of widths) {
        const b = buckets.get(w)!
        stream.write(`| ${w} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
    }
    stream.write(`| total | ${totalLines} | ${perFile.length} | |\n`)
    stream.write("\n")
    if (recommendWidth !== undefined) {
        const flag = recommendWidth === "tab" ? "--indent tab" : `--indent ${recommendWidth}`
        writeRecommendation(stream, flag)
        stream.write("\n")
    }
    console.error(`report indent: ${perFile.length} files counted / ${sourceFiles.length} files total`)
}

// Picks the width with the most lines in this file. Ties break toward the
// smaller numeric width (so an evenly-split file is reported under its
// first-level indent), and numeric beats "tab" when those are tied (a
// mixed file is more often a space-indented file with stray tab lines
// than the other way around).
function primaryWidth(counts: IndentCounts): IndentWidth | undefined {
    let best: IndentWidth | undefined
    let bestCount = 0
    for (const [k, v] of counts) {
        if (v > bestCount) {
            bestCount = v
            best = k
            continue
        }
        if (v !== bestCount) continue
        if (best === undefined) {
            best = k
            continue
        }
        if (typeof k === "number" && typeof best === "number" && k < best) best = k
        else if (typeof k === "number" && best === "tab") best = k
    }
    return best
}

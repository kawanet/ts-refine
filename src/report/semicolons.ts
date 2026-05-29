// --report semicolons: per-file trailing-`;` ratio across the nodes the
// LS SemicolonPreference rewrites — ASI-eligible statements plus
// interface/type-literal members (comma-separated members excluded).
// Helps decide which direction minimizes churn when standardizing.

import type {RunSemicolonsOpts} from "@kawanet/ts-survey"
import type {Project} from "ts-morph"

import {displayPath, selectSourceFiles} from "../lib/source-files.ts"
import {isSemiEligibleStatement, isTypeMember} from "../lib/statement-kinds.ts"
import type {ReportOpts} from "./types.ts"

// Fixed 7-row layout: 0% / 100% / exact-50% match by equality, "1-10%" and
// "90-99%" are the near-boundary tails, and the two middle buckets fill the
// remaining gap on either side of 50%. The earlier 10%-stepped layout was
// too sparse to be useful — every middle bucket was empty for typical files.
const BUCKET_LABELS = ["0%", "1-10%", "11-49%", "50%", "51-89%", "90-99%", "100%"] as const

export async function runReportSemicolons(project: Project, {stream, absIncludes, absExcludes}: ReportOpts): Promise<Partial<RunSemicolonsOpts>> {
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    type PerFile = {path: string; total: number; withSemi: number}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        let total = 0
        let withSemi = 0
        sf.forEachDescendant((node) => {
            const member = isTypeMember(node)
            if (!member && !isSemiEligibleStatement(node)) return
            const text = node.getText()
            // Comma-separated members are outside the LS rewrite domain.
            if (member && text.endsWith(",")) return
            total++
            if (text.endsWith(";")) withSemi++
        })
        if (total === 0) continue
        perFile.push({
            path: displayPath(sf.getFilePath()),
            total,
            withSemi,
        })
    }

    const bucketFiles: PerFile[][] = BUCKET_LABELS.map((): PerFile[] => [])
    for (const f of perFile) {
        const idx = bucketIndex(f)
        bucketFiles[idx].push(f)
    }

    // Recommend by counting strictly-below vs strictly-above 50%. File count
    // is the primary signal; when they tie, the total statement count on each
    // side breaks the tie. Files at exactly 50% sit out — they have no lean.
    const below = perFile.filter((f) => f.withSemi * 2 < f.total)
    const above = perFile.filter((f) => f.withSemi * 2 > f.total)
    const belowFiles = below.length
    const aboveFiles = above.length
    const belowStmts = below.reduce((s, f) => s + f.total, 0)
    const aboveStmts = above.reduce((s, f) => s + f.total, 0)
    const recommend: "on" | "off" | undefined =
        belowFiles > aboveFiles
            ? "off"
            : aboveFiles > belowFiles
              ? "on"
              : belowStmts > aboveStmts
                ? "off"
                : aboveStmts > belowStmts
                  ? "on"
                  : undefined

    stream.write("### semicolons\n")
    stream.write("\n")
    // `lines` (statement count) sits next to `files` so the table mirrors
    // the other reports and makes the tiebreaker rationale visible.
    stream.write("| trailing `;` | lines | files | example |\n")
    stream.write("| --- | --- | --- | --- |\n")
    let totalStmts = 0
    for (let i = 0; i < BUCKET_LABELS.length; i++) {
        const files = bucketFiles[i]
        const bucketStmts = files.reduce((s, f) => s + f.total, 0)
        totalStmts += bucketStmts
        if (files.length === 0) {
            stream.write(`| ${BUCKET_LABELS[i]} | 0 | 0 ||\n`)
        } else {
            // The example column shows the file with the largest statement count
            // in the bucket; ties resolved lexicographically by path.
            const example = files.slice().sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))[0]
            stream.write(`| ${BUCKET_LABELS[i]} | ${bucketStmts} | ${files.length} | ${example.path} |\n`)
        }
    }
    stream.write(`| total | ${totalStmts} | ${perFile.length} | |\n`)
    stream.write("\n")
    console.error(`report semicolons: ${perFile.length} files counted / ${sourceFiles.length} files total`)
    // The recommendation is rendered in the trailing `## recommendation`
    // section, so all we return here is the action params shape.
    return recommend ? {semicolons: recommend} : {}
}

function bucketIndex({total, withSemi}: {total: number; withSemi: number}): number {
    if (withSemi === 0) return 0
    if (withSemi === total) return 6
    if (withSemi * 2 === total) return 3
    if (withSemi * 10 <= total) return 1
    if (withSemi * 2 < total) return 2
    if (withSemi * 10 >= total * 9) return 5
    return 4
}

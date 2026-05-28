// --report semicolons: per-file trailing-`;` ratio across ASI-eligible
// statements, bucketed into a compact fixed layout. Helps decide which
// direction minimizes churn when standardizing on insert or remove.

import type {RunSemicolonsOpts} from "@kawanet/ts-survey"
import type {Project} from "ts-morph"

import {displayPath, selectSourceFiles} from "../lib/source-files.ts"
import {isSemiEligibleStatement} from "../lib/statement-kinds.ts"
import type {ReportOpts} from "../lib/types.ts"

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
            if (!isSemiEligibleStatement(node)) return
            total++
            if (node.getText().endsWith(";")) withSemi++
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

    // Recommend based on file counts strictly below vs strictly above 50%,
    // so the minority-style files are the ones that get rewritten. Files at
    // exactly 50% are ambiguous and excluded from the comparison.
    const below = perFile.filter((f) => f.withSemi * 2 < f.total).length
    const above = perFile.filter((f) => f.withSemi * 2 > f.total).length
    const recommend: "on" | "off" | undefined = below > above ? "off" : above > below ? "on" : undefined

    stream.write("### semicolons\n")
    stream.write("\n")
    stream.write("| trailing `;` | files | example |\n")
    stream.write("| --- | --- | --- |\n")
    for (let i = 0; i < BUCKET_LABELS.length; i++) {
        const files = bucketFiles[i]
        if (files.length === 0) {
            stream.write(`| ${BUCKET_LABELS[i]} | 0 ||\n`)
        } else {
            // The example column shows the file with the largest statement count
            // in the bucket; ties resolved lexicographically by path.
            const example = files.slice().sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))[0]
            stream.write(`| ${BUCKET_LABELS[i]} | ${files.length} | ${example.path} |\n`)
        }
    }
    stream.write(`| total | ${perFile.length} | |\n`)
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

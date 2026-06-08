// report semi: per-file trailing-`;` ratio across the nodes the
// LS SemicolonPreference rewrites — ASI-eligible statements plus
// interface/type-literal members (comma-separated members excluded).
// Helps decide which direction minimizes churn when standardizing.

import type {TSR} from "ts-refine"
import type {Node as TsNode} from "typescript"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import {logging} from "../common/logging.ts"
import {displayPath} from "../lib/source-files.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"
import {SEMI_ELIGIBLE_STATEMENT_KINDS, TYPE_MEMBER_KINDS} from "./statement-kinds.ts"

// Fixed 7-row layout: 0% / 100% / exact-50% match by equality, "1-10%" and
// "90-99%" are the near-boundary tails, and the two middle buckets fill the
// remaining gap on either side of 50%. The earlier 10%-stepped layout was
// too sparse to be useful — every middle bucket was empty for typical files.
const BUCKET_LABELS = ["0%", "1-10%", "11-49%", "50%", "51-89%", "90-99%", "100%"] as const

export async function runReportSemi({sourceFiles, log, importsOnly}: ReportRunOpts): Promise<Partial<TSR.SemiReport>> {
    type PerFile = {path: string; total: number; withSemi: number}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const fullText = sf.getFullText()
        const counts = {total: 0, withSemi: 0}

        // Walk the compiler AST directly: the kind test and the trailing-char
        // check below need only a raw node, so the per-visit wrapper
        // (and a dozen `Node.isX` guards per node) that forEachDescendant would
        // allocate are the dominant cost avoided here.
        // importsOnly: only the import/export statements are rewritten, so weigh
        // just their trailing `;` (the statements themselves, not descendants).
        if (importsOnly) {
            for (const d of sf.getImportDeclarations()) consider(d.compilerNode, fullText, counts)
            for (const d of sf.getExportDeclarations()) consider(d.compilerNode, fullText, counts)
        } else {
            const visit = (node: TsNode): void => {
                consider(node, fullText, counts)
                node.forEachChild(visit)
            }
            visit(sf.compilerNode)
        }
        if (counts.total === 0) continue
        perFile.push({
            path: displayPath(sf.getFilePath()),
            total: counts.total,
            withSemi: counts.withSemi,
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
    const recommend: "on" | "off" | undefined = belowFiles > aboveFiles ? "off" : aboveFiles > belowFiles ? "on" : belowStmts > aboveStmts ? "off" : aboveStmts > belowStmts ? "on" : undefined
    const report: TSR.SemiReport = recommend ? {semi: recommend} : {}

    // Build the display section as raw table cells; the CLI renders it. `lines`
    // (statement count) sits next to `files` so the table mirrors the other
    // reports and makes the tiebreaker rationale visible.
    const heading = getTsRefineFormat({semi: report}) || "(semi)"
    const table: string[][] = [["trailing `;`", "lines", "files", "example"]]
    let totalStmts = 0
    for (let i = 0; i < BUCKET_LABELS.length; i++) {
        const files = bucketFiles[i]
        const bucketStmts = files.reduce((s, f) => s + f.total, 0)
        totalStmts += bucketStmts
        if (files.length === 0) {
            table.push([BUCKET_LABELS[i], "0", "0", ""])
        } else {
            // The example column shows the file with the largest statement count
            // in the bucket; ties resolved lexicographically by path.
            const example = files.slice().sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))[0]
            table.push([BUCKET_LABELS[i], String(bucketStmts), String(files.length), example.path])
        }
    }
    table.push(["total", String(totalStmts), String(perFile.length), ""])
    report.sections = [{title: heading, table}]

    logging(log, `report semi: ${perFile.length} files counted / ${sourceFiles.length} files total`)

    return report
}

// Count one node toward the file's trailing-`;` tally when it is a node the LS
// SemicolonPreference rewrites. Only the node's last character is inspected, so
// no node text is allocated: `;` means it has a trailing semicolon, while a
// `,` on a comma-separated member marks it outside the LS rewrite domain.
function consider(node: TsNode, fullText: string, counts: {total: number; withSemi: number}): void {
    const member = TYPE_MEMBER_KINDS.has(node.kind)
    if (!member && !SEMI_ELIGIBLE_STATEMENT_KINDS.has(node.kind)) return
    const last = fullText.charCodeAt(node.end - 1)
    if (member && last === 0x2c) return // ',' separator: LS leaves it untouched
    counts.total++
    if (last === 0x3b) counts.withSemi++ // ';'
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

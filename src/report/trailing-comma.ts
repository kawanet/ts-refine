// report trailing-comma: classify multi-line comma-separated lists by whether
// they carry a trailing comma. Scope is shared with the apply pass via
// lib/comma-lists (listOf): array / object / call / param / enum / tuple /
// named-import lists, excluding angle-bracket and interface/type/class member
// lists. A dynamic `import()` resolves like any call, so listOf still returns
// its argument list; the vote below skips it via isDynamicImport, matching the
// apply pass which keeps it comma-free.
// Single-line lists never vote — a trailing comma there is not a layout choice
// the convention speaks to — so only the author's multi-line lists are counted.

import type {TSR} from "ts-refine"
import type {Node as TsNode} from "typescript"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import {logging} from "../common/logging.ts"
import {isDynamicImport, isSpreadOrRest, listOf} from "../lib/comma-lists.ts"
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
function classify(text: string, node: TsNode): Style | null {
    const list = listOf(node, text)
    if (list == null) return null

    // The apply pass forces a dynamic import to "no comma" regardless of the
    // chosen style, so it speaks to neither side — exclude it from the vote.
    if (isDynamicImport(node)) return null
    const last = list.elements[list.elements.length - 1]
    if (isSpreadOrRest(last)) return null
    const multiline = hasLineBreakBetween(text, last.end, list.closeStart)
    if (!multiline) return null
    return list.hasTrailingComma ? "on" : "off"
}

export async function runReportTrailingComma({sourceFiles, log, importsOnly}: ReportRunOpts): Promise<Partial<TSR.TrailingCommaReport>> {
    type PerFile = {path: string; counts: Map<Style, number>; primary: Style}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const text = sf.getFullText()
        const counts = new Map<Style, number>()

        // Walk the compiler AST directly: the classifier already works on raw
        // compiler nodes, so the per-visit wrapper is pure overhead.
        const visit = (node: TsNode): void => {
            const style = classify(text, node)
            if (style != null) counts.set(style, (counts.get(style) ?? 0) + 1)
            node.forEachChild(visit)
        }

        // importsOnly: organizeImports only rewrites the import/export
        // statements, so the named-binding lists inside them are the only
        // trailing commas it can touch.
        if (importsOnly) {
            for (const d of sf.getImportDeclarations()) visit(d.compilerNode)
            for (const d of sf.getExportDeclarations()) visit(d.compilerNode)
        } else {
            visit(sf.compilerNode)
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

    // Build the display section as raw table cells; the CLI renders it.
    const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)
    const heading = getTsRefineFormat({trailingComma: report}) || "(trailing-comma)"
    const table: string[][] = [["style", "lists", "files", "example"]]
    for (const k of DISPLAY_ORDER) {
        const b = buckets.get(k)

        // Both styles always get a row (0 when absent) so the two-way
        // comparison is always visible at a glance.
        if (b) {
            table.push([STYLE_LABEL[k], String(b.lines), String(b.files), b.topPath])
        } else {
            table.push([STYLE_LABEL[k], "0", "0", ""])
        }
    }
    table.push(["total", String(totalLines), String(perFile.length), ""])
    report.sections = [{title: heading, table}]

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

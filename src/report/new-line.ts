// report new-line: count the line terminators each file uses, then
// pick the file-count majority. Maps to FormatCodeSettings.newLineCharacter
// and Prettier's `endOfLine`.

import type {TSR} from "ts-refine"
import {logging} from "../common/logging.ts"
import {assertNoLoneCr} from "../lib/assert-no-lone-cr.ts"
import {displayPath} from "../lib/source-files.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"

type NewLine = "lf" | "crlf"

const DISPLAY_ORDER: NewLine[] = ["lf", "crlf"]

const NL_LABEL: Record<NewLine, string> = {
    lf: "`\\n`",
    crlf: "`\\r\\n`",
}

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportNewLine({sourceFiles, log}: ReportRunOpts): Promise<Partial<TSR.NewLineReport>> {
    type PerFile = {path: string; counts: Map<NewLine, number>; primary: NewLine}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const text = sf.getFullText()
        assertNoLoneCr(text, sf.getFilePath())
        const counts = countTerminators(text)
        if (counts.size === 0) continue
        perFile.push({path: displayPath(sf.getFilePath()), counts, primary: pickPrimary(counts)})
    }

    const buckets = new Map<NewLine, Bucket>()
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

    // Build the display section as raw table cells; the CLI renders it. Only the
    // terminators present get a row (no fixed 0-rows). The title is the plain
    // report name — new-line has no `getTsRefineFormat` flag form.
    const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)
    const table: string[][] = [["new-line", "lines", "files", "example"]]
    for (const k of DISPLAY_ORDER) {
        const b = buckets.get(k)
        if (!b) continue
        table.push([NL_LABEL[k], String(b.lines), String(b.files), b.topPath])
    }
    table.push(["total", String(totalLines), String(perFile.length), ""])

    const result: Partial<TSR.NewLineReport> = recommend != null ? {newLine: recommend} : {}
    result.sections = [{title: "new-line", table}]

    logging(log, `report new-line: ${perFile.length} files counted / ${sourceFiles.length} files total`)
    return result
}

// Single pass splitting LF and CRLF; `\r\n` is one terminator (crlf), so the
// scanner skips the LF after the CR. Lone CR is rejected upstream by
// assertNoLoneCr, so a stray `\r` is ignored here.
function countTerminators(text: string): Map<NewLine, number> {
    const counts = new Map<NewLine, number>()
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 0x0a) {
            counts.set("lf", (counts.get("lf") ?? 0) + 1)
        } else if (c === 0x0d && text.charCodeAt(i + 1) === 0x0a) {
            counts.set("crlf", (counts.get("crlf") ?? 0) + 1)
            i++
        }
    }
    return counts
}

// Primary = terminator with the highest count in this file. Ties follow
// the display order (lf > crlf), making LF the conventional default
// when a file mixes styles.
function pickPrimary(counts: Map<NewLine, number>): NewLine {
    let best: NewLine = "lf"
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

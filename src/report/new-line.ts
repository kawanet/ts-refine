// report new-line: count the line terminators each file uses, then
// pick the file-count majority. Maps to FormatCodeSettings.newLineCharacter
// and Prettier's `endOfLine`.

import type {TSR} from "ts-refine"
import {logging} from "../common/logging.ts"
import {displayPath} from "../lib/source-files.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./types.ts"

type NewLine = "lf" | "crlf" | "cr"

const DISPLAY_ORDER: NewLine[] = ["lf", "crlf", "cr"]

const NL_LABEL: Record<NewLine, string> = {
    lf: "`\\n`",
    crlf: "`\\r\\n`",
    cr: "`\\r`",
}

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportNewLine({sourceFiles, output, log}: ReportRunOpts): Promise<Partial<TSR.NewLineOpts>> {
    type PerFile = {path: string; counts: Map<NewLine, number>; primary: NewLine}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const counts = countTerminators(sf.getFullText())
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

    // The Markdown table is for display only; skip it (and its formatting)
    // when no output sink is given — the recommendation above is the result.
    if (output) {
        const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

        output.write("### new-line\n")
        output.write("\n")
        output.write("| new-line | lines | files | example |\n")
        output.write("| --- | --- | --- | --- |\n")
        for (const k of DISPLAY_ORDER) {
            const b = buckets.get(k)
            if (!b) continue
            output.write(`| ${NL_LABEL[k]} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
        }
        output.write(`| total | ${totalLines} | ${perFile.length} | |\n`)
        output.write("\n")
    }
    logging(log, `report new-line: ${perFile.length} files counted / ${sourceFiles.length} files total`)
    return recommend !== undefined ? {newLine: recommend} : {}
}

// Single pass over the text to split LF, CRLF, and lone CR. `\r\n` is one
// terminator (crlf), not `\r` followed by `\n`, so the scanner advances
// past the LF when it sees the pair.
function countTerminators(text: string): Map<NewLine, number> {
    const counts = new Map<NewLine, number>()
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if (c === 0x0a) {
            counts.set("lf", (counts.get("lf") ?? 0) + 1)
        } else if (c === 0x0d) {
            if (text.charCodeAt(i + 1) === 0x0a) {
                counts.set("crlf", (counts.get("crlf") ?? 0) + 1)
                i++
            } else {
                counts.set("cr", (counts.get("cr") ?? 0) + 1)
            }
        }
    }
    return counts
}

// Primary = terminator with the highest count in this file. Ties follow
// the display order (lf > crlf > cr), making LF the conventional default
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

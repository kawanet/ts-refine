// --indent N: rewrite every file's leading whitespace so each indent level
// becomes N spaces. The detected source unit comes from lib/detectIndent,
// so a 2-space file maps cleanly to 4-space while a tab-indented file
// re-expands to N spaces per leading tab.
//
// Template-literal content is preserved verbatim: lines whose first
// character lies inside any TemplateExpression / NoSubstitutionTemplateLiteral
// span are skipped, because rewriting their leading whitespace would
// silently change the runtime string value. JSDoc / block-comment
// continuation lines (first non-space `*`) are likewise skipped so their
// 1-space convention is not rescaled.

import type * as declared from "@kawanet/ts-survey"
import fs from "node:fs/promises"
import type {SourceFile} from "ts-morph"
import {Node} from "ts-morph"

import {detectIndent, type IndentWidth, primaryIndentWidth} from "../lib/detect-indent.ts"
import {selectSourceFiles} from "../lib/source-files.ts"

export const runIndent: typeof declared.runIndent = async (project, {dryRun, absIncludes, absExcludes, width}) => {
    const sourceFiles = selectSourceFiles(project, {absIncludes, absExcludes}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    let changedCount = 0
    let totalCount = 0

    for (const sf of sourceFiles) {
        totalCount++
        const filePath = sf.getFilePath()
        const before = sf.getFullText()
        const after = rewriteIndent(sf, before, width)
        if (after === before) continue

        // Refresh ts-morph's in-memory view so a later action in the same
        // dispatch (e.g. --semicolons off) sees the rewritten text.
        sf.replaceWithText(after)
        changedCount++
        if (dryRun) {
            console.log(`would update: ${filePath}`)
        } else {
            await fs.writeFile(filePath, after)
            console.log(`updated: ${filePath}`)
        }
    }

    const verb = dryRun ? "would change" : "changed"
    console.error(`indent: ${verb} ${changedCount} / ${totalCount} files`)
}

function rewriteIndent(sf: SourceFile, text: string, target: number): string {
    const counts = detectIndent(text)
    if (counts.size === 0) return text
    const unit = primaryIndentWidth(counts)
    if (unit === undefined) return text

    // Collect template-literal ranges before we touch the file so the
    // positions remain valid for the duration of the rewrite.
    const tplRanges: [number, number][] = []
    sf.forEachDescendant((node) => {
        if (Node.isTemplateExpression(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
            tplRanges.push([node.getStart(), node.getEnd()])
        }
    })

    const lines = text.split("\n")
    let pos = 0
    let changed = false
    for (let li = 0; li < lines.length; li++) {
        const original = lines[li]
        const updated = rewriteLine(original, pos, unit, target, tplRanges)
        if (updated !== original) {
            lines[li] = updated
            changed = true
        }
        // +1 accounts for the '\n' consumed by split(); the last iteration
        // overshoots harmlessly.
        pos += original.length + 1
    }
    return changed ? lines.join("\n") : text
}

function rewriteLine(line: string, lineStart: number, sourceUnit: IndentWidth, target: number, tplRanges: [number, number][]): string {
    if (line.length === 0) return line
    for (const [s, e] of tplRanges) {
        if (lineStart >= s && lineStart < e) return line
    }

    const first = line[0]
    if (first === "\t") {
        let n = 0
        while (n < line.length && line[n] === "\t") n++
        return " ".repeat(n * target) + line.slice(n)
    }
    if (first !== " ") return line

    let n = 0
    while (n < line.length && line[n] === " ") n++
    if (n === line.length) return line // all-whitespace line
    if (line[n] === "*") return line // block-comment continuation

    if (sourceUnit === "tab") return line // stray space-leading line in tab file
    if (n % sourceUnit !== 0) return line // alignment / continuation indent
    const level = n / sourceUnit
    return " ".repeat(level * target) + line.slice(n)
}

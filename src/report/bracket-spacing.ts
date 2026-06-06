// report bracket-spacing: classify brace pairs by inner padding
// (`{ a }` vs `{a}`). Scope mirrors what FormatCodeSettings'
// insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces rewrites — object
// literals, destructuring, named import/export bindings and their import
// attributes, plus the TS type-literal / interface / enum bodies. Single-line
// statement blocks are deliberately left out (not a bracketSpacing concept).

import {Node, SyntaxKind} from "ts-morph"
import type {TSR} from "ts-refine"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import {logging} from "../common/logging.ts"
import {displayPath} from "../lib/source-files.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"

type Style = "on" | "off"

const DISPLAY_ORDER: Style[] = ["on", "off"]

const STYLE_LABEL: Record<Style, string> = {
    on: "`{ x }`",
    off: "`{x}`",
}

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportBracketSpacing({sourceFiles, output, log, importsOnly}: ReportRunOpts): Promise<Partial<TSR.BracketSpacingReport>> {
    type PerFile = {path: string; counts: Map<Style, number>; primary: Style}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const counts = new Map<Style, number>()
        const visit = (node: Node) => {
            const braces = braceSpan(node)
            if (braces == null) return
            const style = classifyBraces(braces)
            if (style == null) return
            counts.set(style, (counts.get(style) ?? 0) + 1)
        }
        // importsOnly: only the import/export statements are rewritten by
        // organizeImports, so count the braces inside them (named bindings +
        // import attributes), not the whole file.
        if (importsOnly) {
            sf.getImportDeclarations().forEach((d) => d.forEachDescendant(visit))
            sf.getExportDeclarations().forEach((d) => d.forEachDescendant(visit))
        } else {
            sf.forEachDescendant(visit)
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
    const report: TSR.BracketSpacingReport = recommend ? {bracketSpacing: recommend} : {}

    // The Markdown table is for display only; skip it (and its formatting)
    // when no output sink is given — the recommendation above is the result.
    if (output) {
        const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

        const heading = getTsRefineFormat({bracketSpacing: report}) || "(bracket-spacing)"
        output.write(`### ${heading}\n`)
        output.write("\n")
        output.write("| style | nodes | files | example |\n")
        output.write("| --- | --- | --- | --- |\n")
        for (const k of DISPLAY_ORDER) {
            const b = buckets.get(k)

            // Both styles always get a row (0 when absent) so the two-way
            // comparison is always visible at a glance.
            if (b) {
                output.write(`| ${STYLE_LABEL[k]} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
            } else {
                output.write(`| ${STYLE_LABEL[k]} | 0 | 0 |  |\n`)
            }
        }
        output.write(`| total | ${totalLines} | ${perFile.length} |  |\n`)
        output.write("\n")
    }
    logging(log, `report bracket-spacing: ${perFile.length} files counted / ${sourceFiles.length} files total`)

    return report
}

// Node kinds whose own brace pair the LS formatter re-spaces. ImportAttributes
// covers both `import ... with {…}` and the export form. The TS bodies
// (type literal / interface / enum) are re-spaced by formatText just like
// object literals; import attributes are re-spaced by organizeImports.
function isBraceCarrier(node: Node): boolean {
    return (
        Node.isObjectLiteralExpression(node) ||
        Node.isObjectBindingPattern(node) ||
        Node.isNamedImports(node) ||
        Node.isNamedExports(node) ||
        Node.isTypeLiteral(node) ||
        Node.isInterfaceDeclaration(node) ||
        Node.isEnumDeclaration(node) ||
        Node.isImportAttributes(node)
    )
}

// The carrier's own brace pair as source text (e.g. `{ a: number }` from an
// interface, `{type:"json"}` from import attributes), or null when the node
// is not a carrier or has no braces. Uses the immediate brace tokens, so a
// header like `interface I<X = {}>` never picks up the type-parameter braces.
function braceSpan(node: Node): string | null {
    if (!isBraceCarrier(node)) return null
    const open = node.getFirstChildByKind(SyntaxKind.OpenBraceToken)
    const close = node.getLastChildByKind(SyntaxKind.CloseBraceToken)
    if (!open || !close) return null
    return node.getSourceFile().getFullText().slice(open.getStart(), close.getEnd())
}

// Returns the inner-padding style for a brace pair, or null if the node
// shape can't speak to the bracketSpacing convention. Empty `{}`,
// whitespace-only `{ }`, and multi-line forms are all excluded — none
// of them express a `{ a }` vs `{a}` preference.
function classifyBraces(text: string): Style | null {
    if (text.length < 2 || text[0] !== "{" || text[text.length - 1] !== "}") return null
    const inner = text.slice(1, -1)
    if (inner.trim().length === 0) return null

    // CR-only files (no LF) are rare but real; the new-line report
    // already classifies them, so the multi-line skip matches.
    if (/[\r\n]/.test(inner)) return null
    return inner.startsWith(" ") && inner.endsWith(" ") ? "on" : "off"
}

// Primary = style with the highest count in this file. Ties follow the
// display order (on > off), so a mixed-but-balanced file lands under
// the explicit-spacing convention, matching Prettier's default.
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

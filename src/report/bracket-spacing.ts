// report bracket-spacing: classify brace pairs by inner padding
// (`{ a }` vs `{a}`). Scope mirrors what FormatCodeSettings'
// insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces rewrites — object
// literals, destructuring, named import/export bindings and their import
// attributes, plus the TS type-literal / interface / enum bodies. Single-line
// statement blocks are deliberately left out (not a bracketSpacing concept).

import type {TSR} from "ts-refine"
import type {Node as TsNode} from "typescript"
import {SyntaxKind} from "typescript"
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
        const fullText = sf.getFullText()
        const counts = new Map<Style, number>()
        const visit = (node: TsNode): void => {
            const style = classifyBraces(node, fullText)
            if (style != null) counts.set(style, (counts.get(style) ?? 0) + 1)
            node.forEachChild(visit)
        }
        // importsOnly: only the import/export statements are rewritten by
        // organizeImports, so count the braces inside them (named bindings +
        // import attributes), not the whole file.
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

// Brace carriers whose own pair the LS formatter re-spaces, mapped to the
// property holding their member/element list. ImportAttributes covers both
// `import ... with {…}` and the export form. The TS bodies (type literal /
// interface / enum) are re-spaced by formatText like object literals; import
// attributes are re-spaced by organizeImports. The list's `pos` sits right
// after the body's own `{`, so a header like `interface I<X = {}>` never
// picks up the type-parameter braces.
const BRACE_MEMBERS_PROP = new Map<SyntaxKind, string>([
    [SyntaxKind.ObjectLiteralExpression, "properties"],
    [SyntaxKind.ObjectBindingPattern, "elements"],
    [SyntaxKind.NamedImports, "elements"],
    [SyntaxKind.NamedExports, "elements"],
    [SyntaxKind.TypeLiteral, "members"],
    [SyntaxKind.InterfaceDeclaration, "members"],
    [SyntaxKind.EnumDeclaration, "members"],
    [SyntaxKind.ImportAttributes, "elements"],
])

// The inner-padding style for a carrier's brace pair, or null when the node is
// not a carrier or the braces carry no `{ a }` vs `{a}` preference — empty
// `{}`, whitespace-only `{ }`, and multi-line forms. The inner span runs from
// the member list's `pos` (just past `{`) to the node end minus the `}`, so no
// node text is allocated.
function classifyBraces(node: TsNode, fullText: string): Style | null {
    const prop = BRACE_MEMBERS_PROP.get(node.kind)
    if (prop == null) return null
    const list = (node as unknown as Record<string, {pos: number} | undefined>)[prop]
    if (list == null) return null
    const innerStart = list.pos
    const innerEnd = node.end - 1
    if (innerEnd <= innerStart) return null // empty `{}`

    let sawNonSpace = false
    for (let i = innerStart; i < innerEnd; i++) {
        const c = fullText.charCodeAt(i)
        if (c === 0x0a || c === 0x0d) return null // newline: multi-line, no preference
        if (c !== 0x20 && c !== 0x09) sawNonSpace = true
    }
    if (!sawNonSpace) return null // whitespace-only `{ }`
    return fullText.charCodeAt(innerStart) === 0x20 && fullText.charCodeAt(innerEnd - 1) === 0x20 ? "on" : "off"
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

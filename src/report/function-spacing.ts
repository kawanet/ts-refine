import type {TSR} from "ts-refine"
import type {Node as TsNode, SourceFile as TsSourceFile} from "typescript"
import {SyntaxKind} from "typescript"
import type {SourceFile} from "../bridge/bridge.ts"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import {displayPath} from "../lib/source-files.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"

export type FunctionSpacingStyle = "on" | "off"
// The three spacing knobs only — exclude the `sections` display slot that
// FunctionSpacingReport inherits from ReportSections.
export type FunctionSpacingAxis = Exclude<keyof TSR.FunctionSpacingReport, "sections">
export type FunctionSpacingBucket = {lines: number; files: number; topPath: string; topLines: number}
export type FunctionSpacingStyleCounts = Partial<Record<FunctionSpacingStyle, number>>
export type FunctionSpacingAxisConfig = {axis: FunctionSpacingAxis; label: string; order: readonly FunctionSpacingStyle[]; sample: Record<FunctionSpacingStyle, string>}
export type FunctionSpacingRow = {config: FunctionSpacingAxisConfig; buckets: Map<FunctionSpacingStyle, FunctionSpacingBucket>; files: number; total: number}
type Style = FunctionSpacingStyle
type Axis = FunctionSpacingAxis
type Bucket = FunctionSpacingBucket
type AxisConfig = FunctionSpacingAxisConfig
type StyleCounts = FunctionSpacingStyleCounts
type FileCounts = Record<Axis, StyleCounts>
type PerFile = {path: string; counts: StyleCounts; primary: Style}

// Keep the three TS LS spacing knobs together. The report names mirror the
// settings they feed: `function ()`, `function foo()`, and `if (x)`.
const AXES: readonly AxisConfig[] = [
    {
        axis: "functionKeywordSpacing",
        label: "function keyword",
        order: ["on", "off"],
        sample: {
            on: "`function ()`",
            off: "`function()`",
        },
    },
    {
        axis: "functionParenSpacing",
        label: "function paren",
        order: ["off", "on"],
        sample: {
            on: "`function foo ()`",
            off: "`function foo()`",
        },
    },
    {
        axis: "controlKeywordSpacing",
        label: "control keyword",
        order: ["on", "off"],
        sample: {
            on: "`if (x)`",
            off: "`if(x)`",
        },
    },
]

// Survey project files for the three spacing axes and render one table.
// Generic anonymous functions are reported on the paren axis because TS LS
// formats `function <T>()` with insertSpaceBeforeFunctionParenthesis.
export async function runReportFunctionSpacing({sourceFiles, importsOnly}: ReportRunOpts): Promise<Partial<TSR.FunctionSpacingReport>> {
    if (importsOnly) return {}

    const perAxis = new Map<Axis, PerFile[]>()
    for (const axis of AXES) perAxis.set(axis.axis, [])

    for (const sf of sourceFiles) {
        const path = displayPath(sf.getFilePath())
        const countsByAxis = collectFileCounts(sf)
        for (const config of AXES) {
            const counts = countsByAxis[config.axis]
            if (!hasCounts(counts)) continue
            perAxis.get(config.axis)!.push({path, counts, primary: pickPrimary(config.order, counts)})
        }
    }

    const rows: FunctionSpacingRow[] = []
    const report: TSR.FunctionSpacingReport = {}

    for (const config of AXES) {
        const files = perAxis.get(config.axis) ?? []
        const buckets = buildBuckets(files)
        const recommend = pickRecommendByFiles(config.order, (k) => buckets.get(k))
        if (recommend) report[config.axis] = recommend
        rows.push({
            config,
            buckets,
            files: files.length,
            total: [...buckets.values()].reduce((s, b) => s + b.lines, 0),
        })
    }

    // Build the display section as raw table cells; the CLI renders it. Each
    // axis lists its styles in order, then a per-axis total row.
    const heading = getTsRefineFormat({functionSpacing: report}) || "(function-spacing)"
    const table: string[][] = [["axis", "style", "nodes", "files", "example"]]
    for (const row of rows) {
        for (const style of row.config.order) {
            const b = row.buckets.get(style)
            if (b) {
                table.push([row.config.label, row.config.sample[style], String(b.lines), String(b.files), b.topPath])
            } else {
                table.push([row.config.label, row.config.sample[style], "0", "0", ""])
            }
        }
        table.push([row.config.label, "total", String(row.total), String(row.files), ""])
    }
    report.sections = [{title: heading, table}]

    return report
}

// Walk one file and count only AST shapes controlled by these TS LS settings.
// Constructors and async arrows are intentionally absent; these fields do not
// control `constructor ()` or `async () =>`. The compiler AST is walked
// directly (not sf.forEachDescendant): the classifiers below only need raw
// node positions, so the per-visit wrapper is avoided.
function collectFileCounts(sf: SourceFile): FileCounts {
    const functionKeywordSpacing: StyleCounts = {}
    const functionParenSpacing: StyleCounts = {}
    const controlKeywordSpacing: StyleCounts = {}
    const text = sf.getFullText()
    const tsSf = sf.compilerNode

    const visit = (node: TsNode): void => {
        const kind = node.kind
        if (kind === SyntaxKind.FunctionExpression || kind === SyntaxKind.FunctionDeclaration) {
            // functionKeyword axis covers only anonymous functions.
            if ((node as FunctionParts).name == null) {
                const style = classifyFunctionKeyword(node, text)
                if (style) functionKeywordSpacing[style] = (functionKeywordSpacing[style] ?? 0) + 1
            }
        }
        if (kind === SyntaxKind.FunctionExpression || kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration) {
            const style = classifyFunctionParen(node, text)
            if (style) functionParenSpacing[style] = (functionParenSpacing[style] ?? 0) + 1
        }
        if (CONTROL_KEYWORD_LEN.has(kind) || kind === SyntaxKind.DoStatement) {
            const style = classifyControlKeyword(node, text, tsSf)
            if (style) controlKeywordSpacing[style] = (controlKeywordSpacing[style] ?? 0) + 1
        }
        node.forEachChild(visit)
    }
    visit(tsSf)

    return {functionKeywordSpacing, functionParenSpacing, controlKeywordSpacing}
}

// Position-only views of the raw compiler nodes the classifiers read.
type FunctionParts = {
    name?: {end: number}
    typeParameters?: {end: number; length: number}
    asteriskToken?: {end: number}
    modifiers?: {end: number; length: number}
    pos: number
}

// Detect spacing controlled by insertSpaceAfterFunctionKeywordForAnonymousFunctions:
// `const f = function () {}` / `function()`, plus generator `function* ()`.
// Generic anonymous `function <T>()` belongs to functionParenSpacing instead.
function classifyFunctionKeyword(node: TsNode, text: string): Style | null {
    const fn = node as FunctionParts
    if (fn.typeParameters && fn.typeParameters.length > 0) return null
    const from = fn.asteriskToken ? fn.asteriskToken.end : functionKeywordEnd(fn, text)
    return classifyParenGap(from, text)
}

// Detect spacing controlled by insertSpaceBeforeFunctionParenthesis:
// `function foo()` / `foo ()`, methods, and generic anonymous `function <T>()`.
// The gap is measured from the token before `(`: the type-parameter list's
// closing `>` when generic (so `<T extends U<V>>` votes from the outer `>`),
// otherwise the name.
function classifyFunctionParen(node: TsNode, text: string): Style | null {
    const fn = node as FunctionParts
    const generic = fn.typeParameters != null && fn.typeParameters.length > 0
    if (!generic && fn.name == null) return null
    const from = generic ? typeParameterListEnd(fn, text) : fn.name!.end
    if (from < 0) return null
    return classifyParenGap(from, text)
}

// The `function` keyword end for an anonymous, non-generic, non-generator
// function: the keyword follows any modifiers (e.g. `async`, `export default`)
// plus leading trivia, and is the fixed-width `function`.
const FUNCTION_KEYWORD_LENGTH = "function".length
function functionKeywordEnd(fn: FunctionParts, text: string): number {
    const afterModifiers = fn.modifiers && fn.modifiers.length > 0 ? fn.modifiers.end : fn.pos
    return skipTrivia(text, afterModifiers) + FUNCTION_KEYWORD_LENGTH
}

// The position just past the type-parameter list's closing `>`. The list's own
// `end` stops at the last parameter (before any trailing comma and the `>`), so
// skip trivia and an optional trailing comma to reach and step over the `>`.
function typeParameterListEnd(fn: FunctionParts, text: string): number {
    let p = skipTrivia(text, fn.typeParameters!.end)
    if (text.charCodeAt(p) === 0x2c) p = skipTrivia(text, p + 1) // trailing comma `<T,>`
    if (text.charCodeAt(p) !== 0x3e) return -1 // '>'
    return p + 1
}

// Control keywords whose `(` spacing the LS controls, mapped to keyword length
// so the gap to `(` can be measured from the keyword's end. `do … while` is
// handled separately (its `while` is not the statement's first token).
const CONTROL_KEYWORD_LEN = new Map<SyntaxKind, number>([
    [SyntaxKind.IfStatement, 2],
    [SyntaxKind.ForStatement, 3],
    [SyntaxKind.ForInStatement, 3],
    [SyntaxKind.ForOfStatement, 3],
    [SyntaxKind.WhileStatement, 5],
    [SyntaxKind.SwitchStatement, 6],
    [SyntaxKind.CatchClause, 5],
])
const WHILE_KEYWORD_LENGTH = "while".length

// Detect parenthesized control keyword spacing, e.g. `if (x)`, `for(x)`,
// `switch (x)`, and `catch(e)`. `do ... while` is delegated to the `while`
// side; the leading `do {` gap is not TS LS control-parenthesis spacing.
function classifyControlKeyword(node: TsNode, text: string, sf: TsSourceFile): Style | null {
    if (node.kind === SyntaxKind.DoStatement) {
        const whileStart = skipTrivia(text, (node as unknown as {statement: {end: number}}).statement.end)
        return classifyParenGap(whileStart + WHILE_KEYWORD_LENGTH, text)
    }
    const len = CONTROL_KEYWORD_LEN.get(node.kind)
    if (len == null) return null
    return classifyParenGap(node.getStart(sf) + len, text)
}

// Turn the gap between a token's end and the `(` that should follow into a
// vote: `off` when they touch, `on` for a whitespace-only gap, null when a
// comment or any other token sits between (so `(` is not reached). The last
// case also rejects shapes like `for await (`, whose neighbour is not `(`.
function classifyParenGap(from: number, text: string): Style | null {
    const open = skipSpaces(text, from)
    if (text.charCodeAt(open) !== 0x28) return null // '('
    return open === from ? "off" : "on"
}

// Skip ASCII whitespace forward.
function skipSpaces(text: string, pos: number): number {
    while (pos < text.length) {
        const c = text.charCodeAt(pos)
        if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++
        else break
    }
    return pos
}

// Skip whitespace and comments forward, used to step over leading trivia to a
// keyword (e.g. `function` after a jsdoc block or modifiers).
function skipTrivia(text: string, pos: number): number {
    while (pos < text.length) {
        const c = text.charCodeAt(pos)
        if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
            pos++
            continue
        }
        if (c === 0x2f) {
            const n = text.charCodeAt(pos + 1)
            if (n === 0x2f) {
                const nl = text.indexOf("\n", pos + 2)
                if (nl < 0) return text.length
                pos = nl + 1
                continue
            }
            if (n === 0x2a) {
                const end = text.indexOf("*/", pos + 2)
                if (end < 0) return text.length
                pos = end + 2
                continue
            }
        }
        break
    }
    return pos
}

// Group files by their primary style on one axis. For example, a file with
// mostly `function foo()` lands in the `off` bucket even if it has one `foo ()`.
function buildBuckets(files: PerFile[]): Map<Style, Bucket> {
    const buckets = new Map<Style, Bucket>()
    for (const f of files) {
        const linesAtPrimary = f.counts[f.primary] ?? 0
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
    return buckets
}

// Pick the dominant style inside one file, using the axis order as the tie-breaker:
// function keyword/control prefer spaced examples, function paren prefers no gap.
function hasCounts(counts: StyleCounts): boolean {
    return counts.on != null || counts.off != null
}

function pickPrimary(order: readonly Style[], counts: StyleCounts): Style {
    let best = order[0]
    let bestCount = -1
    for (const style of order) {
        const c = counts[style] ?? 0
        if (c > bestCount) {
            bestCount = c
            best = style
        }
    }
    return best
}

import type {Node as TsNode, SourceFile as TsSourceFile} from "typescript"
import {SyntaxKind} from "typescript"
import type {SourceFile} from "../bridge/bridge.ts"

type Style = "on" | "off"

type Edit = {start: number; end: number; text: string}

// The TS formatter can leave type-literal braces asymmetric, notably
// `{[id: string]: boolean }` when bracketSpacing is off. Reassert this narrow
// axis after formatText while leaving multi-line type literals alone.
export function applyTypeLiteralBracketSpacing(sf: SourceFile, style: Style): void {
    const fullText = sf.getFullText()
    const tsSf = sf.compilerNode
    const edits: Edit[] = []

    const visit = (node: TsNode): void => {
        if (node.kind === SyntaxKind.TypeLiteral) {
            collectTypeLiteralEdits(edits, fullText, tsSf, node, style)
        }
        node.forEachChild(visit)
    }
    visit(tsSf)

    if (edits.length === 0) return

    let result = fullText
    for (const e of edits.sort((a, b) => b.start - a.start)) {
        result = result.slice(0, e.start) + e.text + result.slice(e.end)
    }
    sf.replaceWithText(result)
}

function collectTypeLiteralEdits(edits: Edit[], fullText: string, tsSf: TsSourceFile, node: TsNode, style: Style): void {
    const open = node.getStart(tsSf)
    const close = node.end - 1
    if (fullText[open] !== "{" || fullText[close] !== "}") return

    const innerStart = open + 1
    const innerEnd = close
    if (innerEnd <= innerStart) return

    let first = innerStart
    while (first < innerEnd && isHorizontalSpace(fullText.charCodeAt(first))) first++

    let last = innerEnd - 1
    while (last >= first && isHorizontalSpace(fullText.charCodeAt(last))) last--

    if (last < first) return // whitespace-only `{ }`
    if (hasLineBreak(fullText, first, last + 1)) return

    if (style === "off") {
        if (first > innerStart) edits.push({start: innerStart, end: first, text: ""})
        if (last + 1 < innerEnd) edits.push({start: last + 1, end: innerEnd, text: ""})
    } else {
        const leftText = first === innerStart ? " " : fullText.slice(innerStart, first) === " " ? undefined : " "
        const rightText = last + 1 === innerEnd ? " " : fullText.slice(last + 1, innerEnd) === " " ? undefined : " "
        if (leftText != null) edits.push({start: innerStart, end: first, text: leftText})
        if (rightText != null) edits.push({start: last + 1, end: innerEnd, text: rightText})
    }
}

function isHorizontalSpace(c: number): boolean {
    return c === 0x20 || c === 0x09
}

function hasLineBreak(text: string, start: number, end: number): boolean {
    for (let i = start; i < end; i++) {
        const c = text.charCodeAt(i)
        if (c === 0x0a || c === 0x0d) return true
    }
    return false
}

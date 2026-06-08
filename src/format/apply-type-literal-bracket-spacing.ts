import type {Node as TsNode, SourceFile as TsSourceFile, TypeLiteralNode} from "typescript"
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
            collectTypeLiteralEdits(edits, fullText, tsSf, node as TypeLiteralNode, style)
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

function collectTypeLiteralEdits(edits: Edit[], fullText: string, tsSf: TsSourceFile, node: TypeLiteralNode, style: Style): void {
    const members = node.members
    const first = members[0]
    const last = members[members.length - 1]
    if (first == null || last == null) return

    const open = node.getStart(tsSf)
    const close = node.end - 1
    if (fullText[open] !== "{" || fullText[close] !== "}") return

    const innerStart = open + 1
    const innerEnd = close
    // Same fast single-line gate used by the type-literal tail pass: CRLF
    // contains LF, and CR-only files are rejected before format passes run.
    const lf = fullText.indexOf("\n", innerStart)
    if (lf >= 0 && lf < innerEnd) return

    const leftEnd = first.getStart(tsSf)
    const rightStart = last.end
    if (style === "off") {
        addGapEdit(edits, fullText, innerStart, leftEnd, "")
        addGapEdit(edits, fullText, rightStart, innerEnd, "")
    } else {
        addGapEdit(edits, fullText, innerStart, leftEnd, " ")
        addGapEdit(edits, fullText, rightStart, innerEnd, " ")
    }
}

function addGapEdit(edits: Edit[], fullText: string, start: number, end: number, text: string): void {
    if (start > end) return
    const current = fullText.slice(start, end)
    if (current === text) return

    // Only rewrite plain horizontal whitespace. A comment between the brace
    // and member is real trivia, so leave that spacing to the LS formatter.
    for (let i = 0; i < current.length; i++) {
        const c = current.charCodeAt(i)
        if (c !== 0x20 && c !== 0x09) return
    }
    edits.push({start, end, text})
}

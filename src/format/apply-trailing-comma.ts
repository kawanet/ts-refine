// trailingComma apply pass. The LS formatter has no trailing-comma control, so
// refineFormat runs this after formatText. `on` adds a trailing comma to a
// comma-separated list that the author wrote across multiple lines and removes
// it from a single-line one; `off` removes it from those same lists. ts-refine
// has no printWidth, so "multiline" means the author's own layout (the closing
// bracket sits on a later line than the last element), not a reflow decision.
//
// What counts as a list, where it closes, and the spread/rest and dynamic
// import predicates live in lib/comma-lists (shared with the report classifier).
// A spread / rest last element is left as written in both modes: adding a comma
// there is a syntax error, so honoring `off` but not `on` would be lopsided. A
// dynamic import is kept comma-free to match Prettier (see isDynamicImport).

import type {Node as TsNode} from "typescript"
import {SyntaxKind} from "typescript"
import type {SourceFile} from "../bridge/bridge.ts"
import {isDynamicImport, isSpreadOrRest, listOf} from "../lib/comma-lists.ts"
import {hasLineBreakBetween} from "../lib/text-ranges.ts"

// Find the trailing comma between a list's last element and its close token,
// skipping line and block comments so a `,` inside a trailing comment (the
// motivation for the previous AST-based lookup) is never misread as the
// delimiter. The parser's `hasTrailingComma` flag tells us one exists; this
// returns its exact position so it can be deleted.
function findCommaSkippingComments(text: string, from: number, to: number): number {
    let i = from
    while (i < to) {
        const c = text.charCodeAt(i)
        if (c === 44) return i // ','
        if (c === 47) { // '/'
            const next = text.charCodeAt(i + 1)
            if (next === 47) {
                const nl = text.indexOf("\n", i + 2)
                if (nl < 0 || nl >= to) return -1
                i = nl + 1
                continue
            }
            if (next === 42) {
                const end = text.indexOf("*/", i + 2)
                if (end < 0 || end >= to) return -1
                i = end + 2
                continue
            }
        }
        i++
    }
    return -1
}

// importsOnly narrows the walk to import/export specifier lists, so the
// imports/move/rename commands reassert the comma style without touching any
// other list in the file. The format command omits it and walks the whole file.
export function applyTrailingComma(sf: SourceFile, mode: "on" | "off", opts?: {importsOnly?: boolean}): void {
    const full = sf.getFullText()
    const tsSf = sf.compilerNode
    const edits: {start: number; end: number; text: string}[] = []

    const visit = (node: TsNode): void => {
        applyToNode(node, full, mode, edits)
        node.forEachChild(visit)
    }

    if (opts?.importsOnly) {
        // Recurse into the file only until an import/export declaration is
        // reached, then run the full list walk inside it.
        const walkImports = (node: TsNode): void => {
            if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) {
                visit(node)
            } else {
                node.forEachChild(walkImports)
            }
        }
        walkImports(tsSf)
    } else {
        visit(tsSf)
    }

    if (edits.length === 0) return

    // Build the final text once (last-to-first so offsets stay valid) and write
    // it back with a single replaceWithText — no mutation during the walk.
    edits.sort((a, b) => b.start - a.start)
    let result = full
    for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end)
    sf.replaceWithText(result)
}

function applyToNode(node: TsNode, full: string, mode: "on" | "off", edits: {start: number; end: number; text: string}[]): void {
    const list = listOf(node, full)
    if (list == null) return
    const last = list.elements[list.elements.length - 1]
    if (isSpreadOrRest(last)) return

    const end = last.end
    const multiline = hasLineBreakBetween(full, end, list.closeStart)
    // A dynamic import never wants a trailing comma (Prettier parity), so it
    // takes the remove branch below and `on` strips an existing one.
    const wantComma = mode === "on" && multiline && !isDynamicImport(node)
    if (wantComma === list.hasTrailingComma) return // already conforms

    if (wantComma) {
        edits.push({start: end, end, text: ","}) // insert after the element
    } else {
        const commaPos = findCommaSkippingComments(full, end, list.closeStart)
        if (commaPos >= 0) {
            edits.push({start: commaPos, end: commaPos + 1, text: ""}) // drop the trailing comma
        }
    }
}

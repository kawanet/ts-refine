// trailingComma apply pass. The LS formatter has no trailing-comma control, so
// refineFormat runs this after formatText. `on` adds a trailing comma to a
// comma-separated list that the author wrote across multiple lines and removes
// it from a single-line one; `off` removes it everywhere. ts-refine has no
// printWidth, so "multiline" means the author's own layout (the closing bracket
// sits on a later line than the last element), not a reflow decision.
//
// Out of scope: interface / type-literal / class member lists (the separators
// pass owns those) and angle-bracket lists `<...>` (type parameters and type
// arguments, incl. TSX `<T,>`), which are left untouched. A trailing comma
// after a spread / rest element (`...x`) is never touched — adding one is a
// syntax error in params / binding patterns, and it is skipped uniformly.

import type {Node, SourceFile} from "ts-morph"
import {Node as N, SyntaxKind} from "ts-morph"

export type List = {elements: Node[]; close: Node}

// Function-like nodes whose parameter list carries a trailing comma.
const PARAMETER_KINDS = new Set<SyntaxKind>([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.Constructor,
    SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor,
    SyntaxKind.MethodSignature,
    SyntaxKind.CallSignature,
    SyntaxKind.ConstructSignature,
    SyntaxKind.FunctionType,
    SyntaxKind.ConstructorType,
])

// The comma-separated list a node owns (elements + its closing bracket token),
// or undefined for nodes this pass doesn't touch. Angle-bracket lists and
// interface/type/class member lists are intentionally absent.
export function listOf(node: Node): List | undefined {
    if (N.isArrayLiteralExpression(node) || N.isArrayBindingPattern(node) || N.isTupleTypeNode(node)) {
        const close = node.getFirstChildByKind(SyntaxKind.CloseBracketToken)
        return close && {elements: node.getElements(), close}
    }
    if (N.isObjectLiteralExpression(node)) {
        const close = node.getFirstChildByKind(SyntaxKind.CloseBraceToken)
        return close && {elements: node.getProperties(), close}
    }
    if (N.isObjectBindingPattern(node) || N.isNamedImports(node) || N.isNamedExports(node)) {
        const close = node.getFirstChildByKind(SyntaxKind.CloseBraceToken)
        return close && {elements: node.getElements(), close}
    }
    if (N.isEnumDeclaration(node)) {
        const close = node.getFirstChildByKind(SyntaxKind.CloseBraceToken)
        return close && {elements: node.getMembers(), close}
    }
    if (N.isCallExpression(node) || N.isNewExpression(node)) {
        const close = node.getFirstChildByKind(SyntaxKind.CloseParenToken)
        return close && {elements: node.getArguments(), close}
    }
    if (PARAMETER_KINDS.has(node.getKind())) {
        const close = node.getFirstChildByKind(SyntaxKind.CloseParenToken)
        // getParameters exists on every parametered node listed above.
        return close && {elements: (node as unknown as {getParameters(): Node[]}).getParameters(), close}
    }
    return undefined
}

export function applyTrailingComma(sf: SourceFile, mode: "on" | "off"): void {
    const full = sf.getFullText()
    const edits: {start: number; end: number; text: string}[] = []

    sf.forEachDescendant((node) => {
        const list = listOf(node)
        if (list == null || list.elements.length === 0) return
        const last = list.elements[list.elements.length - 1]

        // Never touch the comma after a spread / rest element: adding one is a
        // syntax error in params / binding patterns, so leave it as written.
        if (last.getText().startsWith("...")) return

        // The author's layout decides "multiline": the closing bracket is on a
        // later line than the last element. No printWidth / reflow.
        const multiline = last.getEndLineNumber() !== list.close.getStartLineNumber()
        const wantComma = mode === "on" && multiline

        // The trailing comma, if any, sits between the last element and the
        // close bracket (there are no further elements to introduce a comma).
        const gap = full.slice(last.getEnd(), list.close.getStart())
        const commaOffset = gap.indexOf(",")
        const hasComma = commaOffset >= 0
        if (wantComma === hasComma) return // already conforms

        if (wantComma) {
            edits.push({start: last.getEnd(), end: last.getEnd(), text: ","}) // insert after the element
        } else {
            const at = last.getEnd() + commaOffset
            edits.push({start: at, end: at + 1, text: ""}) // drop the trailing comma
        }
    })

    if (edits.length === 0) return

    // Build the final text once (last-to-first so offsets stay valid) and write
    // it back with a single replaceWithText — no mutation during the walk.
    edits.sort((a, b) => b.start - a.start)
    let result = full
    for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end)
    sf.replaceWithText(result)
}

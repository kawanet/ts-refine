// trailingComma apply pass. The LS formatter has no trailing-comma control, so
// refineFormat runs this after formatText. `on` adds a trailing comma to a
// comma-separated list that the author wrote across multiple lines and removes
// it from a single-line one; `off` removes it from those same lists. ts-refine
// has no printWidth, so "multiline" means the author's own layout (the closing
// bracket sits on a later line than the last element), not a reflow decision.
//
// Out of scope: interface / type-literal / class member lists (the separators
// pass owns those) and angle-bracket lists `<...>` (type parameters and type
// arguments, incl. TSX `<T,>`), which are left untouched. A spread / rest last
// element (`...x`) is also left as written in both modes: adding a comma there
// is a syntax error in rest / binding positions, so honoring `off` (remove) but
// not `on` (add) would be lopsided — the position is excluded outright.

import type {Node, SourceFile} from "ts-morph"
import {Node as N, SyntaxKind} from "ts-morph"
import {hasLineBreakBetween} from "../lib/text-ranges.ts"

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

// The trailing comma token after a list's last element (its next-sibling
// token), or undefined when absent. Resolved through the AST, not a text scan,
// so a comma inside a trailing comment (`1 // a, b`) stays trivia and is never
// mistaken for the list delimiter.
export function trailingCommaToken(lastElement: Node): Node | undefined {
    return lastElement.getNextSiblingIfKind(SyntaxKind.CommaToken)
}

// Spread (`...x`) / rest (`...x` in param, binding, tuple) detection via AST
// kinds. `getText().startsWith("...")` was simpler but allocates the full
// source slice per node — the dominant cost on hot trailing-comma walks.
export function isSpreadOrRestElement(node: Node): boolean {
    return N.isSpreadElement(node) || N.isSpreadAssignment(node) || N.isRestTypeNode(node) || (node.compilerNode as {dotDotDotToken?: unknown}).dotDotDotToken != null
}

// importsOnly narrows the walk to import/export specifier lists, so the
// imports/move/rename commands reassert the comma style without touching any
// other list in the file. The format command omits it and walks the whole file.
export function applyTrailingComma(sf: SourceFile, mode: "on" | "off", opts?: {importsOnly?: boolean}): void {
    const full = sf.getFullText()
    const edits: {start: number; end: number; text: string}[] = []

    const visit = (node: Node) => {
        const list = listOf(node)
        if (list == null || list.elements.length === 0) return
        const last = list.elements[list.elements.length - 1]

        // Leave a spread / rest last element as written in both modes: adding a
        // comma is a syntax error in rest / binding positions, so removing in
        // `off` only would be lopsided. Excluded outright, not handled one-way.
        if (isSpreadOrRestElement(last)) return

        // The author's layout decides "multiline": the closing bracket is on a
        // later line than the last element. No printWidth / reflow. A direct
        // source-text scan is cheaper than line-number lookups on hot walks.
        const end = last.getEnd()
        const multiline = hasLineBreakBetween(full, end, list.close.getStart())
        const wantComma = mode === "on" && multiline

        const commaTok = trailingCommaToken(last)
        const hasComma = commaTok != null
        if (wantComma === hasComma) return // already conforms

        if (wantComma) {
            edits.push({start: end, end, text: ","}) // insert after the element
        } else if (commaTok) {
            edits.push({start: commaTok.getStart(), end: commaTok.getEnd(), text: ""}) // drop the trailing comma
        }
    }

    if (opts?.importsOnly) {
        sf.getImportDeclarations().forEach((d) => d.forEachDescendant(visit))
        sf.getExportDeclarations().forEach((d) => d.forEachDescendant(visit))
    } else {
        sf.forEachDescendant(visit)
    }

    if (edits.length === 0) return

    // Build the final text once (last-to-first so offsets stay valid) and write
    // it back with a single replaceWithText — no mutation during the walk.
    edits.sort((a, b) => b.start - a.start)
    let result = full
    for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end)
    sf.replaceWithText(result)
}

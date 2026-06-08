// Comma-separated list shape, shared between the trailing-comma apply pass and
// its report classifier so both agree on what counts as a list and where it
// closes. The apply pass (format) edits the comma; the report (survey) only
// votes — keeping this neutral layer in lib avoids a report → format import.
//
// In scope: array / object / call / param / enum / tuple / named-import lists.
// Out of scope (no element array resolved here): angle-bracket lists `<...>`
// and interface / type-literal / class member lists, which the separators pass
// owns. Spread/rest and dynamic import carry their own predicates below.
//
// Works on raw TypeScript compiler nodes (not bridge wrappers): the per-visit
// wrapper allocation dominated these hot walks, so callers hand off
// `node.compilerNode` and read positions / `hasTrailingComma` directly.

import type {NodeArray, Node as TsNode} from "typescript"
import {SyntaxKind} from "typescript"

// Function-like nodes whose parameter list carries a trailing comma. Their
// element array always lives on `parameters`, so elementsOf maps them together
// rather than listing each in LIST_ELEMENTS_PROP.
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

// Each remaining list-bearing kind mapped to the property holding its element
// array (parameter kinds are covered by PARAMETER_KINDS above).
const LIST_ELEMENTS_PROP = new Map<SyntaxKind, string>([
    [SyntaxKind.ArrayLiteralExpression, "elements"],
    [SyntaxKind.ArrayBindingPattern, "elements"],
    [SyntaxKind.TupleType, "elements"],
    [SyntaxKind.ObjectLiteralExpression, "properties"],
    [SyntaxKind.ObjectBindingPattern, "elements"],
    [SyntaxKind.NamedImports, "elements"],
    [SyntaxKind.NamedExports, "elements"],
    [SyntaxKind.EnumDeclaration, "members"],
    [SyntaxKind.CallExpression, "arguments"],
    [SyntaxKind.NewExpression, "arguments"],
])

// A comma-separated list in scope. `hasTrailingComma` is the parser's own flag
// on `NodeArray`; `closeStart` is the source position of the closing bracket /
// brace / paren token.
export type ListInfo = {elements: readonly TsNode[]; hasTrailingComma: boolean; closeStart: number}

// Resolve the list a node owns. Returns undefined for nodes outside scope, for
// empty lists (nothing to vote on), or — for parameter lists without parens,
// like a bare arrow `x => x` — when no close paren is found.
export function listOf(node: TsNode, text: string): ListInfo | undefined {
    const els = elementsOf(node)
    if (els == null || els.length === 0) return undefined

    // Function-like nodes extend past the close paren (signature/body follow),
    // so `node.end` is not the close position. Scan forward from the last
    // parameter for `)`, skipping comments and an optional trailing comma.
    // A bare arrow (`x => x`) hits a non-list character before `)` and is
    // rightly skipped (returns undefined).
    if (PARAMETER_KINDS.has(node.kind)) {
        const closeStart = findListCloseParen(text, els[els.length - 1].end)
        if (closeStart < 0) return undefined
        return {elements: els, hasTrailingComma: els.hasTrailingComma === true, closeStart}
    }

    // For every other kind here the close token is a single character and the
    // node ends right after it, so `node.end - 1` is the close position.
    return {elements: els, hasTrailingComma: els.hasTrailingComma === true, closeStart: node.end - 1}
}

// Dynamic `import(...)` is a CallExpression whose callee is the `import`
// keyword. Prettier `trailingComma: "all"` never trails its argument list and
// strips an existing comma — unlike a normal call or `new` — so the apply pass
// keeps it comma-free and the report excludes it from the vote.
export function isDynamicImport(node: TsNode): boolean {
    return node.kind === SyntaxKind.CallExpression && (node as {expression?: TsNode}).expression?.kind === SyntaxKind.ImportKeyword
}

// Spread (`...x`) / rest element detection via AST kinds rather than a `...`
// text prefix. Avoids allocating the node's text per visit.
export function isSpreadOrRest(node: TsNode): boolean {
    switch (node.kind) {
        case SyntaxKind.SpreadElement:
        case SyntaxKind.SpreadAssignment:
        case SyntaxKind.RestType:
            return true
    }
    return (node as {dotDotDotToken?: unknown}).dotDotDotToken != null
}

// The element array a list-bearing node owns, or undefined for other kinds.
// The property differs by kind (elements / properties / members / arguments /
// parameters); a `NewExpression` with no parens has no `arguments` and yields
// undefined. Returned as `NodeArray` so the caller can read the parser's
// `hasTrailingComma` flag off it.
function elementsOf(node: TsNode): NodeArray<TsNode> | undefined {
    const prop = LIST_ELEMENTS_PROP.get(node.kind) ?? (PARAMETER_KINDS.has(node.kind) ? "parameters" : undefined)
    if (prop == null) return undefined
    return (node as unknown as Record<string, NodeArray<TsNode> | undefined>)[prop]
}

// Locate the close paren for a parameter list given the end position of its
// last parameter. Walks only over whitespace, comments, and at most one
// trailing comma — anything else means this is not a parenthesized list and
// the caller leaves it alone.
function findListCloseParen(text: string, from: number): number {
    let i = from
    while (i < text.length) {
        const c = text.charCodeAt(i)
        if (c === 41) return i // ')'
        if (c === 47) { // '/'
            const next = text.charCodeAt(i + 1)
            if (next === 47) {
                const nl = text.indexOf("\n", i + 2)
                if (nl < 0) return -1
                i = nl + 1
                continue
            }
            if (next === 42) {
                const end = text.indexOf("*/", i + 2)
                if (end < 0) return -1
                i = end + 2
                continue
            }
            return -1
        }
        // 9 tab, 10 LF, 13 CR, 32 space, 44 comma
        if (c !== 9 && c !== 10 && c !== 13 && c !== 32 && c !== 44) return -1
        i++
    }
    return -1
}

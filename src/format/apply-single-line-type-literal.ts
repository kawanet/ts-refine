import {SyntaxKind, type SourceFile} from "ts-morph"

// TS LS SemicolonPreference.Insert adds `;` to the last type member too, while
// Prettier keeps single-line type literals bare at the tail. This narrow pass
// trims only that final delimiter so statement semicolons stay controlled by LS.
//
// Walk the compiler AST directly rather than `sf.forEachDescendant`: the only
// inputs needed per node are kind / members / pos / end, and the per-visit
// ts-morph Node wrapper dominated this pass's runtime. Writes still go through
// the ts-morph SourceFile so the wrapped tree refreshes after editing.
export function applySingleLineTypeLiteralTail(sf: SourceFile): void {
    const edits: number[] = []
    const fullText = sf.getFullText()
    const tsSf = sf.compilerNode

    const visit = (node: import("typescript").Node): void => {
        if (node.kind === SyntaxKind.TypeLiteral) {
            // Reject in O(1) when there is no trailing `;` to remove — the common
            // case for most type literals — before any text scan or wrapping.
            const members = (node as import("typescript").TypeLiteralNode).members
            const last = members[members.length - 1]
            if (last != null) {
                const semi = last.end - 1
                if (fullText[semi] === ";") {
                    // Skip multi-line type literals. Scan only the node's range
                    // for LF; CRLF still contains LF, so CR is not consulted.
                    const start = node.getStart(tsSf)
                    const lf = fullText.indexOf("\n", start)
                    if (!(lf >= 0 && lf < node.end)) {
                        edits.push(semi)
                    }
                }
            }
        }
        node.forEachChild(visit)
    }
    visit(tsSf)

    if (edits.length === 0) return

    let result = fullText
    for (const pos of edits.sort((a, b) => b - a)) {
        result = result.slice(0, pos) + result.slice(pos + 1)
    }
    sf.replaceWithText(result)
}

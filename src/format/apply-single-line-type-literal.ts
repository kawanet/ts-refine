import {Node, type SourceFile} from "ts-morph"

// TS LS SemicolonPreference.Insert adds `;` to the last type member too, while
// Prettier keeps single-line type literals bare at the tail. This narrow pass
// trims only that final delimiter so statement semicolons stay controlled by LS.
export function applySingleLineTypeLiteralTail(sf: SourceFile): void {
    const edits: number[] = []
    const fullText = sf.getFullText()

    sf.forEachDescendant((node) => {
        if (!Node.isTypeLiteral(node)) return
        if (/[\r\n]/.test(node.getText())) return

        const members = node.getMembers()
        const last = members[members.length - 1]
        if (last == null) return

        const semi = last.getEnd() - 1
        if (fullText[semi] === ";") edits.push(semi)
    })

    if (edits.length === 0) return

    let result = fullText
    for (const pos of edits.sort((a, b) => b - a)) {
        result = result.slice(0, pos) + result.slice(pos + 1)
    }
    sf.replaceWithText(result)
}

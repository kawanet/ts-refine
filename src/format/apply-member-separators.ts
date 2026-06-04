// memberSeparators apply pass. The LS formatter can't set interface / class
// member separators (and can't emit commas at all), so refineFormat runs this
// after formatText to normalize each member's trailing punctuation to the
// chosen style. Scope mirrors the member-separators report: interface and
// class members (body-bearing members carry no separator).

import type {ClassMemberTypes, SourceFile, TypeElementTypes} from "ts-morph"
import {Node} from "ts-morph"
import type {TSR} from "ts-refine"
import {isSeparableMember} from "../report/member-separators.ts"

type Member = ClassMemberTypes | TypeElementTypes

// The member node text includes its trailing `;` / `,` (getText covers it),
// so drop a single trailing separator to rebuild from a clean base.
function stripSeparator(text: string): string {
    const t = text.trimEnd()
    return t.endsWith(";") || t.endsWith(",") ? t.slice(0, -1) : t
}

// A "bare" member is a property with neither a type annotation nor an
// initializer (just a name). Dropping its separator can fuse it with the next
// member — `foo` + `<T>(): T` reparses as one generic method, `get` + `foo()`
// as a getter — so `none` keeps a `;` there. Anything with a type / initializer
// / its own parens self-terminates and is safe.
function isBareMember(member: Member): boolean {
    if (Node.isPropertySignature(member)) return member.getTypeNode() == null
    if (Node.isPropertyDeclaration(member)) return member.getTypeNode() == null && member.getInitializer() == null
    return false
}

// For `none`, the separator can only be removed when a newline already splits
// this member from the next one in source order (a same-line gap needs a
// separator) and removing it can't fuse the two members. `next` is the next
// member of any kind, including body-bearing ones the apply skips — otherwise a
// field followed by an inline method would look like the last member and lose a
// required separator.
function droppableNone(member: Member, all: Member[], i: number, isClass: boolean): boolean {
    const next = all[i + 1]
    if (next == null) return true // last member: nothing to separate from `}`
    if (member.getEndLineNumber() >= next.getStartLineNumber()) return false
    if (isBareMember(member)) return false
    // A class field's initializer is an expression, so a following computed
    // member continues it once the separator is gone: `x = foo` + `[y] = 1`
    // reparses as `x = foo[y] = 1`. Keep the `;` before a class `[` member.
    // (Interface `[k]: V` index signatures are type context and don't fuse.)
    if (isClass && next.getText().startsWith("[")) return false
    return true
}

export function applyMemberSeparators(sf: SourceFile, style: TSR.MemberSeparatorsOpts["separator"]): void {
    type Edit = {start: number; end: number; text: string}
    const edits: Edit[] = []

    sf.forEachDescendant((node) => {
        if (!Node.isInterfaceDeclaration(node) && !Node.isClassDeclaration(node)) return
        const isClass = Node.isClassDeclaration(node)
        const all = node.getMembers() as Member[]
        all.forEach((member, i) => {
            if (!isSeparableMember(member)) return
            // Class members can't be comma-terminated (`class C { x = 1, }` is a
            // syntax error), so leave them untouched in comma mode.
            if (style === "comma" && isClass) return

            const sep = style === "semi" ? ";" : style === "comma" ? "," : droppableNone(member, all, i, isClass) ? "" : ";"
            const text = member.getText()
            const next = stripSeparator(text) + sep
            if (next !== text) edits.push({start: member.getStart(), end: member.getEnd(), text: next})
        })
    })

    if (edits.length === 0) return
    // Apply last-to-first so each edit's offsets stay valid after the prior ones.
    edits.sort((a, b) => b.start - a.start)
    for (const e of edits) sf.replaceText([e.start, e.end], e.text)
}

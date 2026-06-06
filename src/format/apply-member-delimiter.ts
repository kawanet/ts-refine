// memberDelimiter apply pass. The LS formatter can't set interface / class
// member delimiter (and can't emit commas at all), so refineFormat runs this
// after formatText to normalize each member's trailing punctuation to the
// chosen style. Scope mirrors the member-delimiter report: interface and
// class members (body-bearing members carry no separator).
//
// Every rewrite is checked by re-parsing the member with its immediate
// successor (the only member it could fuse with) in a throwaway wrapper, and
// accepted only when the two member kinds are unchanged and no new syntax error
// appears. The parser is the oracle, so there is no per-shape heuristic —
// fusing a bare member into the next signature (`foo` + `<T>(): T`), a class
// field into a computed member (`x = foo` + `[y]`), a comma on a class field,
// or dropping a separator that two same-line members still need are all
// rejected the same way.

import type {ClassMemberTypes, Project, SourceFile, TypeElementTypes} from "ts-morph"
import {Node} from "ts-morph"
import type {TSR} from "ts-refine"
import {initInMemoryProject} from "../common/init-project.ts"
import {isSeparableMember} from "../report/member-delimiter.ts"

type Member = ClassMemberTypes | TypeElementTypes

// Target trailing separator for each style ("" = none).
const SEPARATOR = {semi: ";", comma: ",", none: ""} as const

// Trailing separator on a member's text: an optional `;` / `,` at the very end.
// getText() ends at the separator token (trailing whitespace is the next node's
// trivia), so no `\s*` is needed. The capture is "" when there is no separator.
// Matched for the current separator and replaced to set the target one, so both
// halves stay in sync.
const TRAILING_SEPARATOR = /([;,]?)$/

// Re-parse a container body and report what a rewrite must preserve: the member
// kinds in order, plus the syntactic parse-error count. The error count is
// needed because the parser is error-tolerant — dropping a separator between
// two same-line members keeps the member count but raises a parse error. The
// probe reuses the source file path so its extension (e.g. .tsx) selects the
// same grammar — JSX member initializers must parse as they do in the source.
function survey(scratch: Project, probePath: string, containerText: string): {kinds: string; errors: number} {
    const sf = scratch.createSourceFile(probePath, containerText, {overwrite: true})
    const container = sf.getInterfaces()[0] ?? sf.getClasses()[0]
    // prettier-ignore
    const kinds = container ? container.getMembers().map((m) => m.getKindName()).join(",") : ""
    const errors = (sf.compilerNode as {parseDiagnostics?: unknown[]}).parseDiagnostics?.length ?? 0
    return {kinds, errors}
}

export function applyMemberDelimiter(sf: SourceFile, style: TSR.MemberDelimiterReport["delimiter"]): void {
    if (!style) return
    const want = SEPARATOR[style]

    // The scratch project for the verification re-parses. Built lazily on the
    // first proposed rewrite, so an already-conforming file (the steady state)
    // never creates one; released with this call. The probe reuses the source
    // path so its extension selects the matching grammar (e.g. .tsx for JSX).
    let scratch: Project | undefined
    const probePath = sf.getFilePath()

    // Accepted edits across the whole file, captured as offsets + text. Collected
    // during traversal but applied only afterwards: mutating `sf` mid-walk
    // reparses it and forgets the nodes the traversal is still visiting, which
    // would skip or corrupt later interfaces/classes in the same file.
    const edits: {start: number; end: number; text: string}[] = []

    sf.forEachDescendant((node) => {
        if (!Node.isInterfaceDeclaration(node) && !Node.isClassDeclaration(node)) return
        const isClass = Node.isClassDeclaration(node)
        // Fast path: a class member can't legally end with a comma, so in comma
        // mode every candidate would fail the re-parse — skip the class outright
        // rather than building and verifying edits the parser would reject.
        if (style === "comma" && isClass) return
        const text = node.getText()
        const base = node.getStart()
        const open = isClass ? "class _ {" : "interface _ {"
        const members = node.getMembers() as Member[]

        members.forEach((member, i) => {
            if (!isSeparableMember(member)) return
            const memberText = member.getText()
            // Read the current trailing separator with a regex rather than
            // rebuilding the member: a conforming member is skipped before the
            // rewritten string is allocated. Only on a change is the replacement
            // built — by the same regex, so extract and rewrite stay in sync.
            const current = memberText.match(TRAILING_SEPARATOR)?.[1] ?? ""
            if (current === want) return // already conforms — no rewrite
            const replacement = memberText.replace(TRAILING_SEPARATOR, want)

            // Verify against just this member and the one it could fuse with —
            // its immediate successor in source order (any kind, including
            // body-bearing). The text between them (whitespace / comments) is
            // kept verbatim, so a same-line gap still reads as same-line. The
            // wrapper matches the container kind (a class field is invalid in an
            // interface, and vice versa).
            const next = members[i + 1]
            const tail = next ? text.slice(member.getEnd() - base, next.getStart() - base) + next.getText() : ""
            scratch ??= initInMemoryProject()
            const before = survey(scratch, probePath, open + memberText + tail + "}")
            const after = survey(scratch, probePath, open + replacement + tail + "}")
            if (after.kinds === before.kinds && after.errors <= before.errors) {
                edits.push({start: member.getStart(), end: member.getEnd(), text: replacement})
            }
        })
    })

    if (edits.length === 0) return

    // Build the final text in one pass (apply edits last-to-first so earlier
    // offsets stay valid) and write it back once, so the file is reparsed a
    // single time instead of per edit.
    edits.sort((a, b) => b.start - a.start)
    let result = sf.getFullText()
    for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end)
    sf.replaceWithText(result)
}

// ASI-guard pass. Prettier's `semi: false` protects a statement that begins
// with `(` by prefixing the previous line with a leading `;`, emitting `;(`.
// The TS LS formatter re-spaces that to `; (`, so refineFormat reasserts the
// tight form after formatText — but only in `semi: "off"` mode, since the
// leading-`;` guard is a semicolon-free idiom that never appears under `on`.
//
// Scope is just the inserted space: indentation differences (the formatter also
// shifts the guarded line) are out of scope and left untouched.

import type {Statement, Node as TsNode} from "typescript"
import {SyntaxKind} from "typescript"
import type {SourceFile} from "../bridge/bridge.ts"

// Cheap gate: skip the AST walk unless the formatted text actually contains a
// `; (` (space or tab between the two). The walk below is the real filter that
// excludes strings, comments, and `for (;;)` headers.
const SPACED_GUARD = /;[ \t]+\(/

// Restore Prettier's tight `;(` where the LS formatter inserted `; (`. The
// guard `;` lands either as its own EmptyStatement (guard at file/block start)
// or, when a statement precedes it, as that statement's terminator — so the
// trigger is any statement ending in `;` immediately followed on the same line
// by a `(`-leading ExpressionStatement. Call after formatText, `semi: "off"` only.
export function applyAsiGuard(sf: SourceFile): void {
    const full = sf.getFullText()
    if (!SPACED_GUARD.test(full)) return

    const tsSf = sf.compilerNode
    const edits: {start: number; end: number}[] = []

    // A guard `;` and the statement it protects are always adjacent entries in a
    // statement list (file/block/module body, switch clauses), so scan adjacent
    // pairs in every such list rather than walking the whole node tree.
    const scan = (stmts: ReadonlyArray<Statement>): void => {
        for (let i = 0; i < stmts.length - 1; i++) {
            const prev = stmts[i]
            // The protecting `;` is the previous statement's last token (a bare
            // EmptyStatement is just `;`, so this covers it too).
            if (full.charCodeAt(prev.end - 1) !== 59) continue // ';'
            const next = stmts[i + 1]
            if (next.kind !== SyntaxKind.ExpressionStatement) continue

            // The gap between `;` and the next statement's first token. Only a
            // run of spaces/tabs (no newline, no comment) qualifies: this keeps
            // the two on the same line, leaves `;\n(...)` un-joined, and skips a
            // `; /* c */ (...)` whose gap would contain non-space characters.
            const nextStart = next.getStart(tsSf)
            const gap = full.slice(prev.end, nextStart)
            if (gap.length === 0 || !/^[ \t]+$/.test(gap)) continue

            // The guarded statement must begin with `(`; `;[...]` never gains a
            // space from the LS, so only the paren form needs reverting.
            if (full.charCodeAt(nextStart) !== 40) continue // '('

            edits.push({start: prev.end, end: nextStart})
        }
    }

    const visit = (node: TsNode): void => {
        const stmts = (node as {statements?: ReadonlyArray<Statement>}).statements
        if (stmts != null) scan(stmts)
        node.forEachChild(visit)
    }
    visit(tsSf)

    if (edits.length === 0) return

    // Apply last-to-first so earlier offsets stay valid, then write back once.
    edits.sort((a, b) => b.start - a.start)
    let result = full
    for (const e of edits) result = result.slice(0, e.start) + result.slice(e.end)
    sf.replaceWithText(result)
}

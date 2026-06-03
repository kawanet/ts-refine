// The import-organizing bundle the write paths share. type-only marker
// settling, organizeImports, and the semicolon cleanup below always run as a
// set, so callers invoke this instead of organizeImports directly.

import type {FormatCodeSettings, SourceFile} from "ts-morph"
import {Node, ts} from "ts-morph"
import {applyTypeOnlyFixes} from "./type-only-fixes.ts"

export function applyOrganizeImports(sf: SourceFile, settings: FormatCodeSettings): void {
    // Settle type-only markers first so the sort can tell type specifiers
    // apart; on a project without verbatimModuleSyntax/isolatedModules it is a
    // no-op.
    applyTypeOnlyFixes(sf, settings)
    sf.organizeImports(settings)
    stripCommentDeferredSemicolons(sf, settings)
}

// organizeImports' printer commits a deferred `;` when a token trails a
// declaration on the same line, even under semicolons:Remove. Drop that
// artifact only for a `//` comment, which runs to the line end so nothing can
// follow; a block comment may precede same-line code that still needs the `;`.
function stripCommentDeferredSemicolons(sf: SourceFile, settings: FormatCodeSettings): void {
    if (settings.semicolons !== ts.SemicolonPreference.Remove) return
    for (const stmt of sf.getStatements()) {
        if (!Node.isImportDeclaration(stmt) && !Node.isExportDeclaration(stmt)) continue
        const semicolon = stmt.getLastChild()
        if (!semicolon || semicolon.getKind() !== ts.SyntaxKind.SemicolonToken) continue
        const trailedByLineComment = semicolon.getTrailingCommentRanges().some((range) => range.getKind() === ts.SyntaxKind.SingleLineCommentTrivia)
        if (trailedByLineComment) semicolon.replaceWithText("")
    }
}

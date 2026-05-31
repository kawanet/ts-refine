// Type-only import/export rewrites that ride along with organizeImports.
// These are TS language-service "fix all" code fixes whose scope is the
// import/export declaration only; like organizeImports' own remove-unused
// pass they fire purely from diagnostics, so a project without
// verbatimModuleSyntax/isolatedModules sees a clean no-op.

import type {FormatCodeSettings, SourceFile} from "ts-morph"

// Applied in this order before organizeImports: split rescues an illegal
// `import type X, {Y}` so later fixes see a legal AST, convert-import adds
// `type` markers so the subsequent sort can tell type specifiers apart, and
// convert-export mirrors that on the re-export side.
const FIX_IDS = ["splitTypeOnlyImport", "convertToTypeOnlyImport", "convertToTypeOnlyExport"] as const

export function applyTypeOnlyFixes(sf: SourceFile, formatSettings: FormatCodeSettings): void {
    const opts = sf.getProject().getCompilerOptions()
    // This bundle targets verbatimModuleSyntax/isolatedModules. getCombinedCodeFix
    // forces a per-file semantic pass for any fixId — even the syntactic split —
    // so partial gating saves nothing; skip the whole bundle when neither flag is
    // set. A standalone illegal `import type X, {Y}` is then left to tsc.
    if (!opts.verbatimModuleSyntax && !opts.isolatedModules) return

    const ls = sf.getProject().getLanguageService()
    for (const fixId of FIX_IDS) {
        // Output style follows the TS LS default (inline `{type X, y}`); no
        // UserPreference is forced so consumer tsconfig stays in control.
        ls.getCombinedCodeFix(sf, fixId, formatSettings).applyChanges()
    }
}

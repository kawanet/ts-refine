// Shared post-processing for the write commands that edit imports/usages
// (move, rename): re-sort the import block of each file they changed, using
// the project-wide surveyed style so the result converges on the codebase's
// conventions rather than each file's own. Files the command didn't touch
// are not passed in, so they stay as-is until `format` unifies them.

import type {SourceFile} from "ts-morph"
import type {TSR} from "ts-refine"
import {applyTypeOnlyFixes} from "../lib/type-only-fixes.ts"
import {formatStyleToSettings} from "./format-settings.ts"

export function organizeChangedImports(files: Iterable<SourceFile>, format: TSR.FormatStyle): void {
    const resolved = formatStyleToSettings(format)
    // Honor the organize-imports gate the same way refineFormat does: a
    // `{organizeImports: "off"}` caller keeps its rewritten paths but skips the
    // re-sort (and the type-only settling that feeds it) entirely.
    if (!resolved.organizeImports) return
    for (const sf of files) {
        // Mirror the `format` bundle so touched files get the same type
        // markers settled before the re-sort.
        applyTypeOnlyFixes(sf, resolved.formatSettings)
        sf.organizeImports(resolved.formatSettings)
    }
}

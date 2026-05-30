// Shared post-processing for the write commands that edit imports/usages
// (move, rename): re-sort the import block of each file they changed, using
// the project-wide surveyed style so the result converges on the codebase's
// conventions rather than each file's own. Files the command didn't touch
// are not passed in, so they stay as-is until `format` unifies them.

import type {SourceFile} from "ts-morph"
import type {TSR} from "ts-refine"
import {reportToFormatOptions, resolveSettings} from "./format-options.ts"

export function organizeChangedImports(files: Iterable<SourceFile>, report: TSR.ReportResult): void {
    const {formatSettings} = resolveSettings(reportToFormatOptions(report))
    for (const sf of files) sf.organizeImports(formatSettings)
}

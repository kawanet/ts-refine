// Report-internal input. The dispatcher selects the project's source files
// once and hands every report the same SourceFile[]; renamed from the public
// `TSR.ReportOpts` (which it no longer mirrors) to avoid the name clash.

import type {SourceFile} from "ts-morph"
import type {TSR} from "ts-refine"

export interface ReportRunOpts {
    sourceFiles: SourceFile[]
    output?: TSR.Writer
    log?: TSR.Writer

    // Restrict scanning to import/export statements (see TSR.ReportOpts).
    // Omitted = false. bracket-spacing/semicolons scan only those statements;
    // member-separators returns empty (they carry no members); indent/new-line
    // are whole-file by nature and ignore it.
    importsOnly?: boolean
}

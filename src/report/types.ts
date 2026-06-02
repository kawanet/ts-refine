// Report-internal input. The dispatcher selects the project's source files
// once and hands every report the same SourceFile[]; renamed from the public
// `TSR.ReportOpts` (which it no longer mirrors) to avoid the name clash.

import type {SourceFile} from "ts-morph"
import type {TSR} from "ts-refine"

export interface ReportRunOpts {
    sourceFiles: SourceFile[]
    output?: TSR.Writer
    log?: TSR.Writer
}

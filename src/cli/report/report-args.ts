// `report`: collect report-name selectors (`--<report>`), the optional
// `--output`, and positional files. Unknown `--<name>` is treated as a
// report selector (validated later by refineReport). Globals are consumed
// into `common`; the `--<name>` catch runs only after parseCommonArgs so it
// can't swallow --project / --dry-run.

import {reportNames as knownReportNames} from "../../report/report-names.ts"
import {type CommonArgs, parseCommonArgs} from "../args-common.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface ReportArgs {
    paths: string[]
    // The requested selectors, or the full registry when none are given.
    reportNames: string[]
    // Suppress Markdown and emit the named output instead.
    output: string | null
    // True only for a bare `report` (no selectors, no --output); gates the
    // recommendation + .prettierrc blocks under the per-report Markdown.
    surveyDefault: boolean
}

export function parseReport(sub: string[], common: CommonArgs): ReportArgs | undefined {
    const reportNames: string[] = []
    const paths: string[] = []
    let output: string | null = null
    let i = 0

    while (i < sub.length) {
        const a = sub[i]
        if (a === "--output") {
            const v = sub[i + 1]
            if (!v || v.startsWith("-")) {
                console.error("--output requires a value (e.g. --output prettier)")
                return undefined
            }
            output = v
            i += 2
            continue
        }
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed < 0) return undefined
        if (consumed > 0) {
            i += consumed
        } else if (a.startsWith("--")) {
            const name = a.slice(2)
            if (!reportNames.includes(name)) reportNames.push(name)
            i++
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            paths.push(a)
            i++
        }
    }

    // report is read-only; --dry-run is a write-command flag.
    if (common.dryRun) {
        console.error("--dry-run is not valid for the report command")
        return undefined
    }

    const surveyDefault = reportNames.length === 0 && output === null
    const effectiveReports = reportNames.length > 0 ? reportNames : [...knownReportNames]
    return {paths, reportNames: effectiveReports, output, surveyDefault}
}

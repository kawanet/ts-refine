// `report`: collect report-name selectors (`--<report>`), the optional
// `--emit`, and positional files. Unknown `--<name>` is treated as a
// report selector (validated later by refineReport). Globals are consumed
// into `common`; the `--<name>` catch runs only after parseCommonArgs so it
// can't swallow --project / --dry-run.

import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface ReportArgs {
    paths: string[]

    // The requested selectors, or the full registry when none are given.
    reports?: string[]

    // Suppress Markdown and emit the named output instead.
    emit?: string
}

export function parseReportArgs(sub: string[], common: CommonArgs): ReportArgs | undefined {
    const reportNames: string[] = []
    const paths: string[] = []
    let emit: string | undefined
    let i = 0

    while (i < sub.length) {
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed > 0) {
            i += consumed
            continue
        }

        const a = sub[i]
        if (a === "--emit") {
            const v = sub[i + 1]
            if (!v || v.startsWith("-")) {
                throw new Error("--emit requires a value (e.g. --emit prettier)")
            }
            emit = v
            i += 2
        } else if (a.startsWith("--")) {
            const name = a.slice(2)
            if (!reportNames.includes(name)) reportNames.push(name)
            i++
        } else if (a.startsWith("-")) {
            throw new Error(`unknown option: ${a}`)
        } else {
            paths.push(a)
            i++
        }
    }

    // report is read-only; --dry-run is a write-command flag.
    if (common.dryRun) {
        throw new Error("--dry-run is not valid for the report command")
    }

    const reports = reportNames?.length ? reportNames : undefined
    return {paths, reports, emit}
}

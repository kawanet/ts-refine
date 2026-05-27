// Report router. Holds the registry of report names → implementation
// functions, exposes the known names for argument validation, and runs
// the requested subset in registry order. The order here is the order
// reports appear in multi-report output.

import type {Project} from "ts-morph"

import type {Writer} from "../lib/writable.ts"
import {runReportSemicolons} from "./semicolons.ts"
import type {ReportOpts} from "./unused-exports.ts"
import {runReportUnusedExports} from "./unused-exports.ts"

const REPORTS: Record<string, (project: Project, opts: ReportOpts) => Promise<void>> = {
    "unused-exports": runReportUnusedExports,
    semicolons: runReportSemicolons,
}

export const reportNames = Object.keys(REPORTS)

export type RunReportsOpts = {
    reportNames: string[]
    stream: Writer
    absIncludes: string[]
    absExcludes: string[]
}

export async function runReports(project: Project, opts: RunReportsOpts): Promise<void> {
    const {stream, reportNames: requested, absIncludes, absExcludes} = opts
    for (const name of Object.keys(REPORTS)) {
        if (!requested.includes(name)) continue
        await REPORTS[name](project, {stream, absIncludes, absExcludes})
    }
}

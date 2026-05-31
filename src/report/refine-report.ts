// Report router. Validates argv-side input against the report-name
// registry (kept in ./report-names.ts so it can be imported without
// dragging in ts-morph) and runs requested reports in a fixed order.
// Each report function returns the action params its recommendation
// would drive (or an empty partial when nothing strict was found); the
// router merges those into a single ReportResult so a caller can
// chain them into action calls (or render them via report --output).

import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {runReportBracketSpacing} from "./bracket-spacing.ts"
import {runReportIndent} from "./indent.ts"
import {runReportMemberSeparators} from "./member-separators.ts"
import {runReportNewLine} from "./new-line.ts"
import {reportNames} from "./report-names.ts"
import {runReportSemicolons} from "./semicolons.ts"
import type {ReportOpts} from "./types.ts"

export const refineReport: typeof declared.refineReport = async (project, opts) => {
    const {stream, reportNames: requested, paths, log} = opts

    // Validate every requested name up-front so a typo fails before any
    // report runs. `reportNames` is the source of truth for what exists.
    for (const name of requested) {
        if (!(reportNames as readonly string[]).includes(name)) {
            throw new Error(`unknown report name: ${name} (known: ${reportNames.join(", ")})`)
        }
    }

    const report: TSR.ReportResult = {}
    const reportOpts: ReportOpts = {stream, paths, log}

    if (requested.includes("semicolons")) {
        report.semicolons = await runReportSemicolons(project, reportOpts)
    }
    if (requested.includes("indent")) {
        report.indent = await runReportIndent(project, reportOpts)
    }
    if (requested.includes("member-separators")) {
        report.memberSeparators = await runReportMemberSeparators(project, reportOpts)
    }
    if (requested.includes("new-line")) {
        report.newLine = await runReportNewLine(project, reportOpts)
    }
    if (requested.includes("bracket-spacing")) {
        report.bracketSpacing = await runReportBracketSpacing(project, reportOpts)
    }

    return report
}

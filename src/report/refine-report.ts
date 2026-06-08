// Report router. Validates argv-side input against the report-name
// registry (kept in ./report-names.ts so it can be imported without
// dragging in the bridge) and runs requested reports in a fixed order.
// Each report function returns the action params its recommendation
// would drive (or an empty partial when nothing strict was found); the
// router merges those into a single ReportResult so a caller can
// chain them into action calls (or render them via report --emit).

import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {reportNames} from "../common/report-names.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {runReportBracketSpacing} from "./bracket-spacing.ts"
import {runReportFunctionSpacing} from "./function-spacing.ts"
import {runReportIndent} from "./indent.ts"
import {runReportMemberDelimiter} from "./member-delimiter.ts"
import {runReportNewLine} from "./new-line.ts"
import type {ReportRunOpts} from "./report-run-opts.ts"
import {runReportSemi} from "./semi.ts"
import {runReportTrailingComma} from "./trailing-comma.ts"

export const refineReport: typeof declared.refineReport = async (opts) => {
    const {reports, paths, log} = opts
    const project = resolveProject(opts)
    const requested = reports ?? reportNames

    // Validate every requested report name up-front so a typo fails before any
    // report runs. `reportNames` is the source of truth for what exists.
    for (const name of requested) {
        if (!(reportNames as readonly string[]).includes(name)) {
            throw new Error(`unknown report name: ${name} (known: ${reportNames.join(", ")})`)
        }
    }

    // No reports requested: skip the project scan entirely.
    if (requested.length === 0) return {}

    // Select the in-project files once and share them across the reports, so
    // the project scan runs a single time instead of per report.
    const sourceFiles = selectSourceFiles(project, {paths})

    return await runReports({sourceFiles, log}, requested)
}

export const runReports = async (reportOpts: ReportRunOpts, requested: readonly TSR.ReportName[]): Promise<TSR.ReportResult> => {
    const report: TSR.ReportResult = {}

    if (requested.includes("semi")) {
        report.semi = await runReportSemi(reportOpts)
    }
    if (requested.includes("indent")) {
        report.indent = await runReportIndent(reportOpts)
    }
    if (requested.includes("member-delimiter")) {
        report.memberDelimiter = await runReportMemberDelimiter(reportOpts)
    }
    if (requested.includes("new-line")) {
        report.newLine = await runReportNewLine(reportOpts)
    }
    if (requested.includes("bracket-spacing")) {
        report.bracketSpacing = await runReportBracketSpacing(reportOpts)
    }
    if (requested.includes("trailing-comma")) {
        report.trailingComma = await runReportTrailingComma(reportOpts)
    }
    if (requested.includes("function-spacing")) {
        report.functionSpacing = await runReportFunctionSpacing(reportOpts)
    }

    return report
}

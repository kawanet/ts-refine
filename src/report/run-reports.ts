// Report router. Validates argv-side input against the report-name
// registry (kept in ./report-names.ts so it can be imported without
// dragging in ts-morph) and runs requested reports in a fixed order.
// Each report function returns the action params its recommendation
// would drive (or an empty partial when nothing strict was found); the
// router merges those into a single TsSurveyReport so a caller can
// chain them into action calls (or render them via report --output).

import type * as declared from "@kawanet/ts-survey"

import type {ReportOpts} from "./types.ts"
import {runReportBracketSpacing} from "./bracket-spacing.ts"
import {runReportIndent} from "./indent.ts"
import {runReportMemberSeparators} from "./member-separators.ts"
import {runReportNewLine} from "./new-line.ts"
import {reportNames} from "./report-names.ts"
import {runReportSemicolons} from "./semicolons.ts"
import {runReportUnusedExports} from "./unused-exports.ts"

export const runReports: typeof declared.runReports = async (project, opts) => {
    const {stream, reportNames: requested, paths} = opts

    // Validate every requested name up-front so a typo fails before any
    // report runs. `reportNames` is the source of truth for what exists.
    for (const name of requested) {
        if (!(reportNames as readonly string[]).includes(name)) {
            throw new Error(`unknown report name: ${name} (known: ${reportNames.join(", ")})`)
        }
    }

    const report: declared.TsSurveyReport = {}
    const reportOpts: ReportOpts = {stream, paths}

    if (requested.includes("unused-exports")) {
        await runReportUnusedExports(project, reportOpts)
    }
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

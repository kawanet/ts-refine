// Format router. Owns the format-name registry and decides what
// post-processing each format performs over a TsSurveyReport. Mirrors
// the runReports router (which owns report-name validation): the CLI
// hands off a raw string and the dispatcher validates + dispatches, so a
// new format slots in by extending `formatNames` and adding a branch.
//
// A null name means "no format selected"; the Markdown report stream is
// untouched and `finalize` is a no-op. A selecting format ("prettier")
// swaps the report stream for a sink so the Markdown body doesn't mix
// into the formatted output.

import type {RunReportsOpts, TsSurveyReport} from "@kawanet/ts-survey"

import {writePrettierConfig} from "../lib/format-prettier.ts"
import {writeTsSurveyCommand} from "../lib/format-ts-survey.ts"

// Local alias for readability — not exported.
type Writer = RunReportsOpts["stream"]

export const formatNames = ["prettier", "ts-survey"] as const

interface FormatDispatch {
    reportStream: Writer
    finalize: (report: TsSurveyReport) => void
}

const NULL_SINK: Writer = {write: () => {}}

export function selectFormat(name: string | null, stdout: Writer): FormatDispatch {
    if (name === null) {
        return {reportStream: stdout, finalize: () => {}}
    }
    if (!(formatNames as readonly string[]).includes(name)) {
        throw new Error(`unknown format: ${name} (known: ${formatNames.join(", ")})`)
    }
    if (name === "prettier") {
        return {
            reportStream: NULL_SINK,
            finalize: (report) => writePrettierConfig(report, stdout),
        }
    }
    if (name === "ts-survey") {
        return {
            reportStream: NULL_SINK,
            finalize: (report) => writeTsSurveyCommand(report, stdout),
        }
    }
    // formatNames is exhaustive — this guards future entries that forget to add a branch.
    throw new Error(`unhandled format: ${name}`)
}

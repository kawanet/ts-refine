// `--output` router. Owns the output-name registry and decides what
// post-processing each output performs over a TsSurveyReport. Mirrors
// the runReports router (which owns report-name validation): the CLI
// hands off a raw string and the dispatcher validates + dispatches, so a
// new output slots in by extending `outputNames` and adding a branch.
//
// A null name means "no output selected"; the Markdown report stream is
// untouched and `finalize` is a no-op. A selecting output ("prettier")
// swaps the report stream for a sink so the Markdown body doesn't mix
// into the rendered output.

import type {RunReportsOpts, TsSurveyReport} from "@kawanet/ts-survey"

import {writePrettierConfig} from "./output-prettier.ts"
import {writeReformatCommand} from "./output-ts-refine.ts"

// Local alias for readability — not exported.
type Writer = RunReportsOpts["stream"]

export const outputNames = ["prettier", "reformat"] as const

interface OutputDispatch {
    reportStream: Writer
    finalize: (report: TsSurveyReport) => void
}

const NULL_SINK: Writer = {write: () => {}}

export function selectOutput(name: string | null, stdout: Writer): OutputDispatch {
    if (name === null) {
        return {reportStream: stdout, finalize: () => {}}
    }
    if (!(outputNames as readonly string[]).includes(name)) {
        throw new Error(`unknown --output: ${name} (known: ${outputNames.join(", ")})`)
    }
    if (name === "prettier") {
        return {
            reportStream: NULL_SINK,
            finalize: (report) => writePrettierConfig(report, stdout),
        }
    }
    if (name === "reformat") {
        return {
            reportStream: NULL_SINK,
            finalize: (report) => writeReformatCommand(report, stdout),
        }
    }
    // outputNames is exhaustive — this guards future entries that forget to add a branch.
    throw new Error(`unhandled --output: ${name}`)
}

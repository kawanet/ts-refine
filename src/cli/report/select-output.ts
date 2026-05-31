// `--emit` router. Owns the emit-name registry and decides what
// post-processing each output performs over a ReportResult. Mirrors
// the refineReport router (which owns report-name validation): the CLI
// hands off a raw string and the dispatcher validates + dispatches, so a
// new output slots in by extending `emitNames` and adding a branch.
//
// A null name means "no output selected"; the Markdown report stream is
// untouched and `finalize` is a no-op. A selecting output ("prettier")
// swaps the report stream for a sink so the Markdown body doesn't mix
// into the rendered output.

import type {TSR} from "ts-refine"
import {writePrettierConfig} from "./emit-prettier.ts"
import {writeFormatCommand} from "./emit-ts-refine.ts"

export const emitNames = ["prettier", "ts-refine"] as const

interface OutputDispatch {
    reportStream: TSR.Writer
    finalize: (report: TSR.ReportResult) => void
}

const NULL_SINK: TSR.Writer = {write: () => {}}

export function selectOutput(name: string | null, stdout: TSR.Writer): OutputDispatch {
    if (name === null) {
        return {reportStream: stdout, finalize: () => {}}
    }
    if (!(emitNames as readonly string[]).includes(name)) {
        throw new Error(`unknown --emit: ${name} (known: ${emitNames.join(", ")})`)
    }
    if (name === "prettier") {
        return {
            reportStream: NULL_SINK,
            finalize: (report) => writePrettierConfig(report, stdout),
        }
    }
    if (name === "ts-refine") {
        return {
            reportStream: NULL_SINK,
            finalize: (report) => writeFormatCommand(report, stdout),
        }
    }
    // emitNames is exhaustive — this guards future entries that forget to add a branch.
    throw new Error(`unhandled --emit: ${name}`)
}

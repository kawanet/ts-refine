// `--emit` router. Owns the emit-name registry and decides what
// post-processing each output performs over a ReportResult. Mirrors
// the refineReport router (which owns report-name validation): the CLI
// hands off a raw string and the dispatcher validates + dispatches, so a
// new output slots in by extending `emitNames` and adding a branch.
//
// A null name means "no output selected"; the Markdown report stream is
// untouched and `finalize` is a no-op. A selecting output ("prettier")
// leaves the report stream unset so refineReport skips the Markdown body,
// keeping it out of the rendered output.

import type {TSR} from "ts-refine"
import {emitPrettierConfig} from "./emit-prettier.ts"
import {emitTsRefineFormat} from "./emit-ts-refine.ts"

export const emitNames = ["prettier", "ts-refine"] as const

interface EmitterDispatch {
    reportStream?: TSR.Writer
    finalize: (report: TSR.ReportResult) => void
}

export function selectEmitter(name: string | null, output: TSR.Writer): EmitterDispatch {
    if (name === null) {
        return {reportStream: output, finalize: () => {}}
    }
    if (!(emitNames as readonly string[]).includes(name)) {
        throw new Error(`unknown --emit: ${name} (known: ${emitNames.join(", ")})`)
    }
    if (name === "prettier") {
        return {
            finalize: (report) => emitPrettierConfig(report, output),
        }
    }
    if (name === "ts-refine") {
        return {
            finalize: (report) => emitTsRefineFormat(report, output),
        }
    }

    // emitNames is exhaustive — this guards future entries that forget to add a branch.
    throw new Error(`unhandled --emit: ${name}`)
}

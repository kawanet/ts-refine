import type {TSR} from "ts-refine"
import {emitNames} from "./emit-names.ts"
import {getPrettierConfig} from "./emit-prettier.ts"
import {getStylisticConfig} from "./emit-stylistic.ts"
import {getTsRefineFormat} from "./emit-ts-refine.ts"

// `--emit` router
export function selectEmitter(name: string | null): ((report: TSR.ReportResult) => string | undefined) | undefined {
    if (name == null) return

    if (name === "prettier") return getPrettierConfig

    if (name === "ts-refine") return getTsRefineFormat

    if (name === "stylistic") return getStylisticConfig

    // emitNames is exhaustive — this guards future entries that forget to add a branch.
    throw new Error(`unknown --emit: ${name} (known: ${emitNames.join(", ")})`)
}

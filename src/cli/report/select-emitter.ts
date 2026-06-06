import type {TSR} from "ts-refine"
import {emitNames} from "../../common/emit-names.ts"
import {getPrettierConfig} from "../../common/emit/emit-prettier.ts"
import {getStylisticConfig} from "../../common/emit/emit-stylistic.ts"
import {getTsRefineFormat} from "../../common/emit/emit-ts-refine.ts"

// `--emit` router
export function selectEmitter(name: string | undefined): ((report: TSR.ReportResult) => string | undefined) | undefined {
    if (name == null) return

    if (name === "prettier") return getPrettierConfig

    if (name === "ts-refine") return getTsRefineFormat

    if (name === "stylistic") return getStylisticConfig

    // emitNames is exhaustive — this guards future entries that forget to add a branch.
    throw new Error(`unknown --emit: ${name} (known: ${emitNames.join(", ")})`)
}

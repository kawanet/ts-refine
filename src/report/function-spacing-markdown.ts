import type {TSR} from "ts-refine"
import {getTsRefineFormat} from "../common/emit/emit-ts-refine.ts"
import type {FunctionSpacingRow} from "./function-spacing.ts"

// Keep Markdown rendering separate from the AST survey so the report logic
// stays focused on which concrete code patterns were counted.
export function writeFunctionSpacingMarkdown(report: TSR.FunctionSpacingReport, rows: FunctionSpacingRow[], output: TSR.Writer): void {
    const heading = getTsRefineFormat({functionSpacing: report}) || "(function-spacing)"
    output.write(`### ${heading}\n`)
    output.write("\n")
    output.write("| axis | style | nodes | files | example |\n")
    output.write("| --- | --- | --- | --- | --- |\n")
    for (const row of rows) {
        for (const style of row.config.order) {
            const b = row.buckets.get(style)
            if (b) {
                output.write(`| ${row.config.label} | ${row.config.sample[style]} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
            } else {
                output.write(`| ${row.config.label} | ${row.config.sample[style]} | 0 | 0 |  |\n`)
            }
        }
        output.write(`| ${row.config.label} | total | ${row.total} | ${row.files} |  |\n`)
    }
    output.write("\n")
}

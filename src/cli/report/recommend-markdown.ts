import type {TSR} from "ts-refine"
import {getPrettierConfig} from "../../common/emit/emit-prettier.ts"
import {getStylisticConfig} from "../../common/emit/emit-stylistic.ts"
import {getTsRefineFormat} from "../../common/emit/emit-ts-refine.ts"

// `## recommendation` block in the default-survey Markdown. Skipped
// when no recommendations fired (the empty form carries no information).
export function writeFormatMarkdown(report: TSR.ReportResult, output: TSR.Writer): void {
    const format = getTsRefineFormat(report)
    if (!format) return

    output.write("## recommendation\n")
    output.write("\n")
    output.write("```sh\n")
    output.write("ts-refine format \\\n")
    output.write(`  ${format}\n`)
    output.write("```\n")
    output.write("\n")
}

// The `.prettierrc` fence appended at the end of the default-survey
// Markdown output. The whole block is skipped when no recommendations
// fired — an empty `{}` block would be pure noise. The trailing blank
// line matches the convention every other report block follows.
export function writePrettierMarkdown(report: TSR.ReportResult, output: TSR.Writer): void {
    const config = getPrettierConfig(report)
    if (config === "{}") return

    output.write("### .prettierrc\n")
    output.write("\n")
    output.write("```json\n")
    output.write(config + "\n")
    output.write("```\n")
    output.write("\n")
}

export function writeStylisticMarkdown(report: TSR.ReportResult, output: TSR.Writer): void {
    const config = getStylisticConfig(report)
    if (config.replace(/\s+/g, "") === '{"rules":{}}') return

    output.write("### @stylistic/eslint-plugin\n")
    output.write("\n")
    output.write("```json\n")
    output.write(config + "\n")
    output.write("```\n")
    output.write("\n")
}

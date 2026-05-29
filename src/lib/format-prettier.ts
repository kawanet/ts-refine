// Renders a TsSurveyReport as the JSON body of a .prettierrc file.
// Only the fields the prettier CLI itself understands are emitted; the
// caller decides what stream to write to (process.stdout for --format
// prettier, an in-memory sink for tests, etc.).
//
// Mapping:
//   semicolons.semicolons === "on"          → semi: true
//   semicolons.semicolons === "off"         → semi: false
//   indent.width === <number>               → tabWidth: <number>, useTabs: false
//   indent.width === "tab"                  → useTabs: true
//   newLine.newLine === <lf|crlf|cr>        → endOfLine: <lf|crlf|cr>
//   bracketSpacing.bracketSpacing === "on"  → bracketSpacing: true
//   bracketSpacing.bracketSpacing === "off" → bracketSpacing: false
// member-separators has no Prettier mapping (comma members are
// unreachable; semi/none is already covered by semi), so it is omitted.
// Reports that didn't recommend anything contribute no fields, so an
// empty TsSurveyReport renders as `{}`.

import type {RunReportsOpts, TsSurveyReport} from "@kawanet/ts-survey"
import type {Options as PrettierOptions} from "prettier"

// Local alias derived from the published shape — not exported, kept
// solely to keep the signatures below readable.
type Writer = RunReportsOpts["stream"]

// Collects the recommendations that fired into a PrettierOptions object.
// Shared by the raw --format prettier output and the .prettierrc fence
// embedded in the default Markdown survey.
function buildPrettierOptions(report: TsSurveyReport): PrettierOptions {
    const opts: PrettierOptions = {}
    if (report.semicolons?.semicolons === "on") opts.semi = true
    else if (report.semicolons?.semicolons === "off") opts.semi = false
    if (report.indent?.width === "tab") {
        opts.useTabs = true
    } else if (typeof report.indent?.width === "number") {
        opts.tabWidth = report.indent.width
        opts.useTabs = false
    }
    if (report.newLine?.newLine) opts.endOfLine = report.newLine.newLine
    if (report.bracketSpacing?.bracketSpacing === "on") opts.bracketSpacing = true
    else if (report.bracketSpacing?.bracketSpacing === "off") opts.bracketSpacing = false
    return opts
}

export function writePrettierConfig(report: TsSurveyReport, stream: Writer): void {
    stream.write(JSON.stringify(buildPrettierOptions(report), null, 4) + "\n")
}

// The `.prettierrc` fence appended at the end of the default-survey
// Markdown output. The whole block is skipped when no recommendations
// fired — an empty `{}` block would be pure noise. The trailing blank
// line matches the convention every other report block follows.
export function writePrettierMarkdown(report: TsSurveyReport, stream: Writer): void {
    const opts = buildPrettierOptions(report)
    if (Object.keys(opts).length === 0) return
    stream.write("### .prettierrc\n")
    stream.write("\n")
    stream.write("```json\n")
    stream.write(JSON.stringify(opts, null, 4) + "\n")
    stream.write("```\n")
    stream.write("\n")
}

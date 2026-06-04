// Renders a ReportResult as the JSON body of a .prettierrc file.
// Only the fields the prettier CLI itself understands are emitted; the
// caller decides what stream to write to (process.stdout for
// `report --emit prettier`, an in-memory sink for tests, etc.).
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
// empty ReportResult renders as `{}`.

import type {Options as PrettierOptions} from "prettier"
import type {TSR} from "ts-refine"

// Collects the recommendations that fired into a PrettierOptions object.
// Reached only through getPrettierConfig, which both the raw --emit
// prettier output and the Markdown .prettierrc fence go through.
function buildPrettierOptions(report: TSR.ReportResult): PrettierOptions {
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
    if (report.trailingComma?.trailingComma === "on") opts.trailingComma = "all"
    else if (report.trailingComma?.trailingComma === "off") opts.trailingComma = "none"
    return opts
}

// Renders the recommendation as the `.prettierrc` JSON body. Returns
// plain text (`{}` when nothing fired), so the caller picks its own
// framing; writePrettierConfig just adds the newline.
export function getPrettierConfig(report: TSR.ReportResult): string {
    const opts = buildPrettierOptions(report)
    return JSON.stringify(opts, null, 4)
}

export function writePrettierConfig(report: TSR.ReportResult, output: TSR.Writer): void {
    output.write(getPrettierConfig(report) + "\n")
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

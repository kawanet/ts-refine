// Renders a TsSurveyReport as the JSON body of a .prettierrc file.
// Only the fields the prettier CLI itself understands are emitted; the
// caller decides what stream to write to (process.stdout for --format
// prettier, an in-memory sink for tests, etc.).
//
// Mapping:
//   semicolons.semicolons === "on"          → semi: true
//   semicolons.semicolons === "off"         → semi: false
//   indent.width === <number>               → tabWidth: <number>, useTabs: false
//   memberSeparators.separator === "semi"   → semi: true   (only when semicolons is silent)
//   memberSeparators.separator === "comma"  → semi: false, trailingComma: "all"
//   memberSeparators.separator === "none"   → semi: false, trailingComma: "none"
//   newLine.newLine === <lf|crlf|cr>        → endOfLine: <lf|crlf|cr>
//   bracketSpacing.bracketSpacing === "on"  → bracketSpacing: true
//   bracketSpacing.bracketSpacing === "off" → bracketSpacing: false
// Reports that didn't recommend anything contribute no fields, so an
// empty TsSurveyReport renders as `{}`.

import type {TsSurveyReport} from "@kawanet/ts-survey"
import type {Options as PrettierOptions} from "prettier"

import type {Writer} from "./writable.ts"

// Collects the recommendations that fired into a PrettierOptions object.
// Shared by the raw --format prettier output and the .prettierrc fence
// embedded in the default Markdown survey.
function buildPrettierOptions(report: TsSurveyReport): PrettierOptions {
    const opts: PrettierOptions = {}
    if (report.semicolons?.semicolons === "on") opts.semi = true
    else if (report.semicolons?.semicolons === "off") opts.semi = false
    if (typeof report.indent?.width === "number") {
        opts.tabWidth = report.indent.width
        opts.useTabs = false
    }
    // member-separators mapping:
    // - `semi` governs both statements and members in Prettier, so when
    //   the two reports both speak it goes to the one with the larger
    //   statement population (semicolons). The member-separator
    //   recommendation only contributes `semi` when semicolons is silent.
    // - `trailingComma` is only meaningful once `semi: false` is committed
    //   (Prettier separates members with `;` when `semi: true`), so it's
    //   gated on that flag.
    // - For the inherently contradictory `semi:true × member=none/comma`
    //   shape we leave `trailingComma` off rather than emit a config
    //   Prettier would interpret as `;` everywhere regardless.
    const ms = report.memberSeparators?.separator
    if (opts.semi === undefined) {
        if (ms === "semi") opts.semi = true
        else if (ms === "comma" || ms === "none") opts.semi = false
    }
    if (opts.semi === false) {
        if (ms === "comma") opts.trailingComma = "all"
        else if (ms === "none") opts.trailingComma = "none"
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

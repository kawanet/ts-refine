// `--format ts-survey`: re-emit the recommendation as a runnable CLI.
// Two-line layout (`\` continuation + 2-space indent) lets
// `grep -E '^ +--'` extract just the flags.

import type {RunReportsOpts, TsSurveyReport} from "@kawanet/ts-survey"

// Local alias for readability — not exported.
type Writer = RunReportsOpts["stream"]

// Fixed emission order so the output is byte-identical regardless of
// upstream property order. Only flags `--apply` actually consumes are
// emitted; member-separators is report-only and intentionally omitted.
function buildTsSurveyFlags(report: TsSurveyReport): string[] {
    const flags: string[] = []
    if (report.semicolons?.semicolons) flags.push(`--semicolons ${report.semicolons.semicolons}`)
    if (report.indent?.width !== undefined) flags.push(`--indent ${report.indent.width}`)
    if (report.newLine?.newLine) flags.push(`--new-line ${report.newLine.newLine}`)
    if (report.bracketSpacing?.bracketSpacing) flags.push(`--bracket-spacing ${report.bracketSpacing.bracketSpacing}`)
    return flags
}

// Always starts with `--apply` (the verb the recommendation translates to).
// Empty recommendations still emit `ts-survey --apply`, paralleling
// `--format prettier`'s empty `{}`.
export function writeTsSurveyCommand(report: TsSurveyReport, stream: Writer): void {
    const flags = buildTsSurveyFlags(report)
    if (flags.length === 0) {
        stream.write("ts-survey --apply\n")
        return
    }
    stream.write("ts-survey --apply \\\n")
    stream.write(`  ${flags.join(" ")}\n`)
}

// `## recommendation` block in the default-survey Markdown. Skipped
// when no recommendations fired (the empty form carries no information).
export function writeTsSurveyMarkdown(report: TsSurveyReport, stream: Writer): void {
    const flags = buildTsSurveyFlags(report)
    if (flags.length === 0) return
    stream.write("## recommendation\n")
    stream.write("\n")
    stream.write("```sh\n")
    stream.write("ts-survey --apply \\\n")
    stream.write(`  ${flags.join(" ")}\n`)
    stream.write("```\n")
    stream.write("\n")
}

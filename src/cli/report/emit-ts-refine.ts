// `--emit ts-refine`: re-emit the recommendation as a runnable CLI.
// Two-line layout (`\` continuation + 2-space indent) lets
// `grep -E '^ +--'` extract just the flags.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../../common/format-style.ts"

// Returns argv-style tokens (flag and value pushed separately), the same
// shape parseArgs consumes. Reads FormatStyle — the same value the
// `format` command applies — so the printed command and the apply agree;
// `cr` is already dropped upstream, so --new-line is always runnable.
function buildFormatFlags(options: TSR.FormatStyle): string[] {
    const flags: string[] = []
    if (options.semicolons) flags.push("--semicolons", options.semicolons)
    if (options.indent !== undefined) flags.push("--indent", String(options.indent))
    if (options.newLine) flags.push("--new-line", options.newLine)
    if (options.bracketSpacing) flags.push("--bracket-spacing", options.bracketSpacing)
    return flags
}

// Always starts with the `format` command (the verb the recommendation
// translates to). Empty recommendations still emit `ts-refine format`,
// paralleling `--emit prettier`'s empty `{}`.
export function writeFormatCommand(report: TSR.ReportResult, output: TSR.Writer): void {
    const flags = buildFormatFlags(reportToFormatStyle(report))
    if (flags.length === 0) {
        output.write("ts-refine format\n")
        return
    }
    output.write("ts-refine format \\\n")
    output.write(`  ${flags.join(" ")}\n`)
}

// `## recommendation` block in the default-survey Markdown. Skipped
// when no recommendations fired (the empty form carries no information).
export function writeFormatMarkdown(report: TSR.ReportResult, output: TSR.Writer): void {
    const flags = buildFormatFlags(reportToFormatStyle(report))
    if (flags.length === 0) return
    output.write("## recommendation\n")
    output.write("\n")
    output.write("```sh\n")
    output.write("ts-refine format \\\n")
    output.write(`  ${flags.join(" ")}\n`)
    output.write("```\n")
    output.write("\n")
}

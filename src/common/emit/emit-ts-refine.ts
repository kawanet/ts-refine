// `--emit ts-refine`: re-emit the recommendation as a runnable CLI.
// Two-line layout (`\` continuation + 2-space indent) lets
// `grep -E '^ +--'` extract just the flags.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../format-style.ts"

// Returns argv-style tokens (flag and value pushed separately), the same
// shape parseArgs consumes. Reads FormatStyle — the same value the
// `format` command applies — so the printed command and the apply agree;
// `cr` is already dropped upstream, so --new-line is always runnable.
export function buildFormatTokens(options: TSR.FormatStyle): string[] {
    const flags: string[] = []
    if (options.semi) flags.push("--semi", options.semi)
    if (options.indent != null) flags.push("--indent", String(options.indent))
    if (options.memberDelimiter) flags.push("--member-delimiter", options.memberDelimiter)
    if (options.newLine) flags.push("--new-line", options.newLine)
    if (options.bracketSpacing) flags.push("--bracket-spacing", options.bracketSpacing)
    if (options.trailingComma) flags.push("--trailing-comma", options.trailingComma)
    return flags
}

// Renders the recommendation as the flag string the `format` command
export function getTsRefineFormat(report: TSR.ReportResult): string {
    const flags = buildFormatTokens(reportToFormatStyle(report))
    return flags.join(" ")
}

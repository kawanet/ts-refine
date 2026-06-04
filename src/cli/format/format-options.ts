// FormatStyle is the canonical per-field formatting intent. Both the report
// recommendation and the CLI overrides are FormatStyle values, so the ts-refine
// command output and the actual apply derive from one value — guaranteeing they
// agree. The pipeline is:
//   ReportResult ── reportToFormatStyle──┐
//                                        ├─ mergeFormatStyles ── formatStyleToSettings ─▶ FormatCodeSettings
//   CLI overrides (already FormatStyle) ─┘
// and buildFormatTokens renders the same FormatStyle back to argv.

import type {TSR} from "ts-refine"
import {formatReportNames} from "../../common/report-names.ts"

// A CLI override pins a field, so surveying the matching report is redundant.
// reportNamesForFormat trims the apply set to the reports still worth running —
// a fully-pinned format skips the survey.
const reportByOverride: {field: keyof TSR.FormatStyle; report: TSR.ReportName}[] = [
    {field: "semicolons", report: "semicolons"},
    {field: "indent", report: "indent"},
    {field: "memberSeparators", report: "member-separators"},
    {field: "newLine", report: "new-line"},
    {field: "bracketSpacing", report: "bracket-spacing"},
    {field: "trailingComma", report: "trailing-comma"},
]

export function reportNamesForFormat(overrides: TSR.FormatStyle): TSR.ReportName[] {
    const skip = new Set(reportByOverride.filter((m) => overrides[m.field] !== undefined).map((m) => m.report))
    return formatReportNames.filter((name) => !skip.has(name))
}

// Per-field precedence: override wins over base, else base, else unset.
export function mergeFormatStyles(base: TSR.FormatStyle, override: TSR.FormatStyle): TSR.FormatStyle {
    return {
        indent: override.indent ?? base.indent,
        semicolons: override.semicolons ?? base.semicolons,
        newLine: override.newLine ?? base.newLine,
        bracketSpacing: override.bracketSpacing ?? base.bracketSpacing,
        memberSeparators: override.memberSeparators ?? base.memberSeparators,
        trailingComma: override.trailingComma ?? base.trailingComma,
    }
}

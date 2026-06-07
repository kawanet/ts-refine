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
type ReportOverrideMap = {field: keyof TSR.FormatStyle; report: TSR.ReportName} | {fields: (keyof TSR.FormatStyle)[]; report: TSR.ReportName}

const reportByOverride: ReportOverrideMap[] = [
    {field: "semi", report: "semi"},
    {field: "indent", report: "indent"},
    {field: "memberDelimiter", report: "member-delimiter"},
    {field: "newLine", report: "new-line"},
    {field: "bracketSpacing", report: "bracket-spacing"},
    {field: "trailingComma", report: "trailing-comma"},
    {fields: ["anonymousFunctionSpacing", "namedFunctionSpacing", "controlKeywordSpacing"], report: "function-spacing"},
]

export function reportNamesForFormat(overrides: TSR.FormatStyle): TSR.ReportName[] {
    const skip = new Set(
        reportByOverride
            .filter((m) => {
                const fields = "fields" in m ? m.fields : [m.field]
                return fields.every((field) => overrides[field] != null)
            })
            .map((m) => m.report),
    )
    return formatReportNames.filter((name) => !skip.has(name))
}

// Per-field precedence: override wins over base, else base, else unset.
export function mergeFormatStyles(base: TSR.FormatStyle, override: TSR.FormatStyle): TSR.FormatStyle {
    return {
        indent: override.indent ?? base.indent,
        semi: override.semi ?? base.semi,
        newLine: override.newLine ?? base.newLine,
        bracketSpacing: override.bracketSpacing ?? base.bracketSpacing,
        memberDelimiter: override.memberDelimiter ?? base.memberDelimiter,
        trailingComma: override.trailingComma ?? base.trailingComma,
        anonymousFunctionSpacing: override.anonymousFunctionSpacing ?? base.anonymousFunctionSpacing,
        namedFunctionSpacing: override.namedFunctionSpacing ?? base.namedFunctionSpacing,
        controlKeywordSpacing: override.controlKeywordSpacing ?? base.controlKeywordSpacing,
    }
}

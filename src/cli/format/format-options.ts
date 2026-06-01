// FormatStyle is the canonical per-field formatting intent. Both the
// report recommendation and the CLI overrides are funneled into it, so
// the ts-refine command output and the actual apply derive from one
// value — guaranteeing they agree. The pipeline is:
//   ReportResult ─reportToFormatOptions─┐
//                                          ├─ mergeFormatOptions ─ resolveSettings ─▶ ResolvedSettings
//   FormatStyle ─overridesToFormatOptions┘
// and buildFormatFlags renders the same FormatStyle back to argv.

import type {TSR} from "ts-refine"
import {applyReportNames} from "../../report/report-names.ts"

// A CLI override pins a field, so surveying the matching report is redundant;
// organizeImports has no report. reportNamesForFormat trims the apply set to
// the reports still worth running — a fully-pinned format skips the survey.
const reportByOverride: {field: keyof TSR.FormatStyle; report: TSR.ReportName}[] = [
    {field: "semicolons", report: "semicolons"},
    {field: "indent", report: "indent"},
    {field: "newLine", report: "new-line"},
    {field: "bracketSpacing", report: "bracket-spacing"},
]

export function reportNamesForFormat(overrides: TSR.FormatStyle): TSR.ReportName[] {
    const skip = new Set(reportByOverride.filter((m) => overrides[m.field] !== undefined).map((m) => m.report))
    return applyReportNames.filter((name) => !skip.has(name))
}

// CLI overrides → options. A typed seam keeping parseArgs decoupled from
// the FormatStyle vocabulary; the shapes happen to line up today.
export function overridesToFormatOptions(overrides: TSR.FormatStyle): TSR.FormatStyle {
    return {
        organizeImports: overrides.organizeImports,
        indent: overrides.indent,
        semicolons: overrides.semicolons,
        newLine: overrides.newLine,
        bracketSpacing: overrides.bracketSpacing,
    }
}

// Per-field precedence: override wins over base, else base, else unset.
export function mergeFormatOptions(base: TSR.FormatStyle, override: TSR.FormatStyle): TSR.FormatStyle {
    return {
        organizeImports: override.organizeImports ?? base.organizeImports,
        indent: override.indent ?? base.indent,
        semicolons: override.semicolons ?? base.semicolons,
        newLine: override.newLine ?? base.newLine,
        bracketSpacing: override.bracketSpacing ?? base.bracketSpacing,
    }
}

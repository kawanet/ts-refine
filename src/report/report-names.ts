// reportNames is the registry of report-name selectors. Every entry is
// also a format input (recommendation-bearing), so the format command
// runs the same set. Kept as a `reportNames` export so future split-out
// (Markdown-only vs apply-bearing) is a one-line change here.

import type {TSR} from "ts-refine"

export const reportNames: readonly TSR.ReportName[] = [
    "semicolons",
    "indent",
    "member-separators",
    "new-line",
    "bracket-spacing",
] as const

// format's default report set is currently the full registry.
export const applyReportNames: readonly TSR.ReportName[] = reportNames

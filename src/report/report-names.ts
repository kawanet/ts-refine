// applyReportNames are the reformat command's default report set;
// extraReportNames are Markdown-only and skipped there. Concat order is
// extras-first to match the pre-split survey layout.

import type {TsSurveyReportName} from "@kawanet/ts-survey"

export const applyReportNames: readonly TsSurveyReportName[] = [
    "semicolons",
    "indent",
    "member-separators",
    "new-line",
    "bracket-spacing",
] as const

export const extraReportNames: readonly TsSurveyReportName[] = [
    "unused-exports",
] as const

// Union: report-name validation + help listing.
export const reportNames: readonly TsSurveyReportName[] = [
    ...extraReportNames,
    ...applyReportNames,
] as const

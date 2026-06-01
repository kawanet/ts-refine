// reportNames is the registry of report-name selectors — the full set the
// `report` command surveys and the CLI offers as `--<name>` flags.

import type {TSR} from "ts-refine"

export const reportNames: readonly TSR.ReportName[] = ["semicolons", "indent", "member-separators", "new-line", "bracket-spacing"] as const

// The apply-bearing subset: the reports format / move / rename actually consume
// (through reportToFormatStyle). member-separators carries no format setting,
// so it is surveyed only for `report` and left out of the apply set.
export const applyReportNames: readonly TSR.ReportName[] = ["semicolons", "indent", "new-line", "bracket-spacing"]

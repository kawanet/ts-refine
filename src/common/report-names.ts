// reportNames is the registry of report-name selectors — the full set the
// `report` command surveys and the CLI offers as `--<name>` flags.

import type {TSR} from "ts-refine"

export const reportNames: readonly TSR.ReportName[] = ["semicolons", "indent", "member-separators", "new-line", "bracket-spacing"] as const

// Reports the `format` command applies. Kept distinct from `reportNames` even
// when the values coincide: the offered registry and the format apply set
// differ in role and may diverge again.
export const formatReportNames: readonly TSR.ReportName[] = ["semicolons", "indent", "member-separators", "new-line", "bracket-spacing"]

// Reports surveyed to style organized imports (the per-file survey behind
// imports/move/rename, via formatSettingsForFile). Only the LS-mappable axes:
// member-separators is absent because it has no LS mapping — it's applied by a
// self-pass, so surveying it for import styling would be wasted work.
export const importReportNames: readonly TSR.ReportName[] = ["semicolons", "indent", "new-line", "bracket-spacing"]

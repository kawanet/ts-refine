// Report-internal: every report function receives the dispatcher's
// per-name slice (no reportNames, that lives on the dispatcher itself).

import type {TSR} from "ts-refine"

export type ReportOpts = Omit<TSR.ReportOpts, "reportNames">

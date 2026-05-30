// Public library entry. cli.ts also routes through here so subcommand
// runner modules stay internal.

import type * as declared from "@kawanet/ts-survey"
import {Project} from "ts-morph"

export {runReformat} from "./format/run-format.ts"
export {runInspect} from "./inspect/run-inspect.ts"
export {runList} from "./list/run-list.ts"
export {runMove} from "./move/run-move.ts"
export {runReports} from "./report/run-reports.ts"

// Lets callers avoid a direct ts-morph dependency for the common case.
export const initProject: typeof declared.initProject = (tsconfigPath) => new Project({tsConfigFilePath: tsconfigPath})

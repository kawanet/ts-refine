// `report` runner: survey-default prints the report tables, then
// `## recommendation` + `### .prettierrc`. Named reports and `--emit` paths
// skip those survey-only blocks.

import type {TSR} from "ts-refine"
import {createRefineProject, refineReport} from "../../index.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseReportArgs} from "./parse-report-args.ts"
import {selectEmitter} from "./select-emitter.ts"

export const reportCLI: CLI = async (ctx) => {
    const {args: common, tokens, output, log} = ctx
    const args = parseReportArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the report command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = createRefineProject({tsConfigFilePath})

    // Report-name validation lives in refineReport so typos surface there.
    const reports = args.reports as TSR.ReportName[] | undefined
    const emitter = selectEmitter(args.emit)

    const report = await refineReport({project, paths, reports, output: emitter ? undefined : output, log})
    if (emitter) {
        const config = emitter(report)
        if (config) output.write(config + "\n")
    }

    return 0
}

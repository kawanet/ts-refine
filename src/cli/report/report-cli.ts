// `report` runner: survey-default prints the report tables, then
// `## recommendation` + `### .prettierrc`. Named reports and `--emit` paths
// skip those survey-only blocks.

import type {TSR} from "ts-refine"
import {initProject} from "../../common/init-project.ts"
import {refineReport} from "../../index.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {writePrettierMarkdown} from "./emit-prettier.ts"
import {writeFormatMarkdown} from "./emit-ts-refine.ts"
import {parseReportArgs} from "./parse-report-args.ts"
import {selectEmitter} from "./select-emitter.ts"

export const reportCLI: CLI = async (ctx) => {
    const {args: common, tokens, output, log} = ctx
    const args = parseReportArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the report command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})

    // Report-name validation lives in refineReport so typos surface there.
    const reportNames = args.reportNames as TSR.ReportName[]
    const emitter = selectEmitter(args.emit, output)

    const report = await refineReport({project, paths, reportNames, output: emitter.reportStream, log})
    if (args.surveyDefault) {
        writeFormatMarkdown(report, output)
        writePrettierMarkdown(report, output)
    }
    emitter.finalize(report)
    return 0
}

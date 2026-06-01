// `move` runner: split the resolved positional list into sources + destination,
// survey the project so the post-move organizeImports follows the codebase's
// conventions, then relocate.

import {reportToFormatStyle} from "../../common/format-style.ts"
import {applyReportNames} from "../../common/report-names.ts"
import {refineMove, refineReport, type TSR} from "../../index.ts"
import {initProject} from "../../lib/init-project.ts"
import {type CLI, NULL_SINK} from "../cli-io.ts"
import {buildFormatTokens} from "../report/emit-ts-refine.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseMoveArgs} from "./parse-move-args.ts"

export const moveCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseMoveArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the move command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})
    const sources = paths.slice(0, -1)
    const dest = paths[paths.length - 1]
    const reportNames = applyReportNames as TSR.ReportName[]
    // Survey, then reduce to the format subset refineMove actually needs.
    const report = await refineReport({project, paths: [], reportNames, output: NULL_SINK, log})
    const format = reportToFormatStyle(report)
    log.write(`format: ${buildFormatTokens(format).join(" ")}\n`)

    await refineMove({project, sources, dest, dryRun: common.dryRun, format, log})
    return 0
}

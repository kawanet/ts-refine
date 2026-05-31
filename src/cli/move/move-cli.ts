// `move` runner: split the resolved positional list into sources + destination,
// survey the project so the post-move organizeImports follows the codebase's
// conventions, then relocate.

import {initProject, refineMove, refineReport, type TSR} from "../../index.ts"
import {applyReportNames} from "../../report/report-names.ts"
import {NULL_SINK} from "../cli-io.ts"
import type {CommonArgs} from "../parse-common-args.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseMoveArgs} from "./parse-move-args.ts"

export async function runMove(sub: string[], common: CommonArgs): Promise<number> {
    const args = parseMoveArgs(sub, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the move command")
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const sources = paths.slice(0, -1)
    const dest = paths[paths.length - 1]
    const reportNames = applyReportNames as TSR.ReportName[]
    const report = await refineReport(project, {paths: [], reportNames, stream: NULL_SINK})
    await refineMove(project, {sources, dest, dryRun: common.dryRun, report})
    return 0
}

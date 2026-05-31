// `rename` runner: survey the project so the post-rename organizeImports
// follows the codebase's conventions, then rename the exported identifier.

import {initProject, refineRename, refineReport, type TSR} from "../../index.ts"
import {applyReportNames} from "../../report/report-names.ts"
import {type Context, NULL_SINK} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseRenameArgs} from "./parse-rename-args.ts"

export async function runRename(ctx: Context): Promise<number> {
    const {args: common, tokens, log} = ctx
    const args = parseRenameArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the rename command")
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const reportNames = applyReportNames as TSR.ReportName[]
    const report = await refineReport(project, {paths: [], reportNames, stream: NULL_SINK, log})
    await refineRename(project, {from: args.from, to: args.to, file: paths[0] ?? null, dryRun: common.dryRun, report, log})
    return 0
}

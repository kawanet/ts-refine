// `rename` runner: survey the project so the post-rename organizeImports
// follows the codebase's conventions, then rename the exported identifier.

import {initProject, refineRename, refineReport, type TSR} from "../../index.ts"
import {applyReportNames} from "../../report/report-names.ts"
import {NULL_SINK} from "../cli-io.ts"
import type {CommonArgs} from "../parse-common-args.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseRenameArgs} from "./parse-rename-args.ts"

export async function runRename(sub: string[], common: CommonArgs): Promise<number> {
    const args = parseRenameArgs(sub, common)
    if (!args) return 1
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const reportNames = applyReportNames as TSR.ReportName[]
    const report = await refineReport(project, {paths: [], reportNames, stream: NULL_SINK})
    await refineRename(project, {from: args.from, to: args.to, file: paths[0] ?? null, dryRun: common.dryRun, report})
    return 0
}

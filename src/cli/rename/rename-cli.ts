// `rename` runner: survey the project so the post-rename organizeImports
// follows the codebase's conventions, then rename the exported identifier.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../../common/format-style.ts"
import {initProject} from "../../common/init-project.ts"
import {applyReportNames} from "../../common/report-names.ts"
import {refineRename, refineReport} from "../../index.ts"
import {type CLI, NULL_SINK} from "../cli-io.ts"
import {buildFormatTokens} from "../report/emit-ts-refine.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseRenameArgs} from "./parse-rename-args.ts"

export const renameCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseRenameArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the rename command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})
    const reportNames = applyReportNames as TSR.ReportName[]

    // Survey, then reduce to the format subset refineRename actually needs.
    const report = await refineReport({project, paths: [], reportNames, output: NULL_SINK, log})
    const format = reportToFormatStyle(report)
    log.write(`format: ${buildFormatTokens(format).join(" ")}\n`)

    await refineRename({project, from: args.from, to: args.to, file: paths[0] ?? null, dryRun: common.dryRun, format, log})
    return 0
}

// `move` runner: split the resolved positional list into sources + destination,
// then relocate. The post-move organizeImports samples each changed file's own
// style (surveyed per file), so a project with mixed formatting keeps each
// file's conventions; use `format` to unify them instead.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../../common/format-style.ts"
import {initProject} from "../../common/init-project.ts"
import {applyReportNames} from "../../common/report-names.ts"
import {refineMove, refineReport} from "../../index.ts"
import {type CLI, NULL_SINK} from "../cli-io.ts"
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

    // Per-file style: survey just the file being organized so each changed
    // file keeps its own existing conventions. refineMove samples a moved file
    // before relocation, so the original path is reported.
    const format = (file: string) => refineReport({project, paths: [file], reportNames, output: NULL_SINK, log: NULL_SINK}).then(reportToFormatStyle)

    await refineMove({project, sources, dest, dryRun: common.dryRun, format, log})
    return 0
}

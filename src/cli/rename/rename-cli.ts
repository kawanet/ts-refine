// `rename` runner: rename the exported identifier, then re-sort each edited
// file's imports using that file's own surveyed style (reported per file), so
// a project with mixed formatting keeps each file's conventions.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../../common/format-style.ts"
import {initProject} from "../../common/init-project.ts"
import {applyReportNames} from "../../common/report-names.ts"
import {refineRename, refineReport} from "../../index.ts"
import {type CLI, NULL_SINK} from "../cli-io.ts"
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

    // Per-file style: survey just the file being organized so each edited file
    // keeps its own existing conventions (use `format` to unify a project).
    const format = (file: string) => refineReport({project, paths: [file], reportNames, output: NULL_SINK, log: NULL_SINK}).then(reportToFormatStyle)

    await refineRename({project, from: args.from, to: args.to, file: paths[0] ?? null, dryRun: common.dryRun, format, log})
    return 0
}

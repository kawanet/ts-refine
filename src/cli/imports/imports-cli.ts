// `imports` runner: organize every selected file's import/export block, sorting
// each file by its own surveyed style (reported per file) so a project with
// mixed formatting keeps each file's conventions. Use `format` to unify a
// project's surrounding style instead.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../../common/format-style.ts"
import {initProject} from "../../common/init-project.ts"
import {applyReportNames} from "../../common/report-names.ts"
import {refineImports, refineReport} from "../../index.ts"
import {type CLI, NULL_SINK} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseImportsArgs} from "./parse-imports-args.ts"

export const importsCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseImportsArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the imports command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})
    const reportNames = applyReportNames as TSR.ReportName[]

    // Per-file style: survey just the file being organized (imports-only tallies)
    // so each file keeps its own existing conventions (use `format` to unify).
    const format = (file: string) => refineReport({project, paths: [file], reportNames, importsOnly: true, log: NULL_SINK}).then(reportToFormatStyle)

    await refineImports({project, paths, dryRun: common.dryRun, format, log})
    return 0
}

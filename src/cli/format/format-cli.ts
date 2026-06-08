// `format` runner: survey the project for the recommendation, then apply it
// (plus any CLI overrides). The Markdown stream is swallowed; refineFormat
// writes the files. Organizing imports is the separate `imports` command.

import {buildFormatTokens} from "../../common/emit/emit-ts-refine.ts"
import {reportToFormatStyle} from "../../common/format-style.ts"
import {initProject} from "../../common/init-project.ts"
import {logging} from "../../common/logging.ts"
import {refineFormat, refineReport} from "../../index.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {mergeFormatStyles, reportNamesForFormat} from "./format-options.ts"
import {parseFormatArgs} from "./parse-format-args.ts"

export const formatCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseFormatArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the format command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})

    // Skip surveying any field the CLI already pinned; a fully-pinned run
    // makes this an empty set and refineReport does no work.
    const reports = reportNamesForFormat(args.applyOverrides)

    // format unifies the project: survey once and apply one merged style. CLI
    // overrides are already a FormatStyle, so they merge in directly.
    const report = await refineReport({project, paths, reports, log})
    const style = mergeFormatStyles(reportToFormatStyle(report), args.applyOverrides)

    logging(log, `format: ${buildFormatTokens(style).join(" ")}`)

    // `--check` reports without writing, so it forces dry-run; the per-file
    // list and summary are already on the log, so only the fix hint is added.
    const dryRun = common.dryRun || args.check
    const result = await refineFormat({project, paths, dryRun, style, log})
    if (args.check && result.touched.length > 0) {
        logging(log, "Run `ts-refine format` to fix.")
        return 1
    }
    return 0
}

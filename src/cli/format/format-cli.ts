// `format` runner: survey the project for the recommendation, then apply it
// (plus any CLI overrides). The Markdown stream is swallowed; refineFormat
// writes the files.

import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../../common/format-style.ts"
import {initProject} from "../../common/init-project.ts"
import {refineFormat, refineReport} from "../../index.ts"
import {type CLI, NULL_SINK} from "../cli-io.ts"
import {buildFormatTokens} from "../report/emit-ts-refine.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {mergeFormatStyles, overridesToFormatStyle, reportNamesForFormat} from "./format-options.ts"
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
    const reportNames = reportNamesForFormat(args.applyOverrides)
    const overrides = overridesToFormatStyle(args.applyOverrides)

    // `only` re-sorts imports without reformatting the rest, so survey each
    // file on its own: an un-unified project then keeps every file's existing
    // style and changes the least. Full format instead unifies the project, so
    // it surveys once and applies a single style.
    let format: TSR.FormatOpts["format"]
    if (args.organizeImports === "only") {
        format = (file) => refineReport({project, paths: [file], reportNames, output: NULL_SINK, log: NULL_SINK}).then((r) => mergeFormatStyles(reportToFormatStyle(r), overrides))
    } else {
        const report = await refineReport({project, paths, reportNames, output: NULL_SINK, log})
        format = mergeFormatStyles(reportToFormatStyle(report), overrides)

        // `cr` is dropped from FormatStyle, so flag it from the report: the survey
        // recommended CR-only newlines but no override forced an applicable value.
        if (args.applyOverrides.newLine === undefined && report.newLine?.newLine === "cr") {
            log.write("note: report recommends CR-only newlines; not applied (LS formatter supports LF/CRLF only)\n")
        }
        log.write(`format: ${buildFormatTokens(format).join(" ")}\n`)
    }

    // `--check` reports without writing, so it forces dry-run; the per-file
    // list and summary are already on the log, so only the fix hint is added.
    const dryRun = common.dryRun || args.check
    const result = await refineFormat({project, paths, dryRun, organizeImports: args.organizeImports, format, log})
    if (args.check && result.touched.length > 0) {
        log.write("Run `ts-refine format` to fix.\n")
        return 1
    }
    return 0
}

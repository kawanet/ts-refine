// `format` runner: survey the project for the recommendation, then apply it
// (plus any CLI overrides). The Markdown stream is swallowed; refineFormat
// writes the files.

import {initProject, refineFormat, refineReport, type TSR} from "../../index.ts"
import {applyReportNames} from "../../report/report-names.ts"
import type {CommonArgs} from "../args-common.ts"
import {NULL_SINK} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseFormat} from "./format-args.ts"

export async function runFormat(sub: string[], common: CommonArgs): Promise<number> {
    const args = parseFormat(sub, common)
    if (!args) return 1
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const reportNames = applyReportNames as TSR.ReportName[]
    const report = await refineReport(project, {paths, reportNames, stream: NULL_SINK})
    await refineFormat(project, {paths, dryRun: common.dryRun, report, ...args.applyOverrides})
    return 0
}

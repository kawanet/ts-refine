// `report` runner: survey-default leads with the list cleanup-candidate
// listing, then the report tables, then `## recommendation` + `### .prettierrc`.
// Named reports and `--output` paths skip those survey-only blocks.

import {initProject, refineList, refineReport, type TSR} from "../../index.ts"
import type {CLIStream} from "../cli-io.ts"
import {filterListEntries, writeListTable} from "../list/write-list-table.ts"
import type {CommonArgs} from "../parse-common-args.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {writePrettierMarkdown} from "./output-prettier.ts"
import {writeFormatMarkdown} from "./output-ts-refine.ts"
import {parseReportArgs} from "./parse-report-args.ts"
import {selectOutput} from "./select-output.ts"

export async function runReport(sub: string[], common: CommonArgs, stream: CLIStream): Promise<number> {
    const args = parseReportArgs(sub, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the report command")
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})

    // Report-name validation lives in refineReport so typos surface there.
    const reportNames = args.reportNames as TSR.ReportName[]
    const output = selectOutput(args.output, stream)

    if (args.surveyDefault) {
        const entries = await refineList(project, {paths})
        const candidates = filterListEntries(entries, {noExports: true, noImporters: true, unusedExports: true})
        stream.write("### list --no-exports --no-importers --unused-exports\n\n")
        writeListTable(candidates, stream)
    }
    const report = await refineReport(project, {paths, reportNames, stream: output.reportStream})
    if (args.surveyDefault) {
        writeFormatMarkdown(report, stream)
        writePrettierMarkdown(report, stream)
    }
    output.finalize(report)
    return 0
}

#!/usr/bin/env node

// argv → Project, then dispatch the subcommand: `ls` lists files, `report`
// prints Markdown (+ optional output finalizer), `reformat` writes the
// recommendations to disk. parseArgs routes and keeps the paths separate.

import type {TsSurveyReportName} from "@kawanet/ts-survey"

import {selectFormat} from "./format/run-format.ts"
import {initProject, runLs, runReformat, runReports} from "./index.ts"
import {filterLsEntries, writeLsTable} from "./ls/format-ls.ts"
import {writePrettierMarkdown} from "./lib/format-prettier.ts"
import {writeReformatMarkdown} from "./lib/format-ts-survey.ts"
import {parseArgs} from "./lib/parse-args.ts"
import {usage} from "./lib/usage.ts"

const opts = parseArgs(process.argv.slice(2))

// parseArgs returns undefined for argv errors (stderr already written),
// {help} for the help command, or ParsedArgs for normal dispatch.
if (opts === undefined) {
    console.error(usage())
    process.exit(1)
}
if ("help" in opts) {
    console.log(usage())
    process.exit(0)
}

const fileOpts = {paths: opts.paths}

// Swallow the Markdown stream in reformat mode; runReformat consumes it.
const NULL_SINK = {write: () => {}}

// Report-name validation lives in runReports so typos surface as a named
// error there. Cast at the boundary (unused by the `ls` command).
const reportNames = opts.reportNames as TsSurveyReportName[]

// Library throws (missing tsconfig, unknown report name) become clean
// CLI errors rather than unhandled rejections.
try {
    const project = initProject(opts.tsconfigPath)

    if (opts.command === "ls") {
        const entries = await runLs(project, fileOpts)
        writeLsTable(filterLsEntries(entries, opts.lsFilters!), process.stdout)
    } else if (opts.command === "reformat") {
        const report = await runReports(project, {...fileOpts, reportNames, stream: NULL_SINK})
        await runReformat(project, {...fileOpts, dryRun: opts.dryRun, report, ...opts.applyOverrides})
    } else {
        const format = selectFormat(opts.output, process.stdout)
        // The default survey leads with the ls cleanup-candidate listing,
        // then the report tables, then `## recommendation` + `### .prettierrc`.
        // Named reports and `--output` paths skip these survey-only blocks.
        if (opts.surveyDefault) {
            const entries = await runLs(project, fileOpts)
            const candidates = filterLsEntries(entries, {noExports: true, noImporters: true, unusedExports: true})
            process.stdout.write("### ls --no-exports --no-importers --unused-exports\n\n")
            writeLsTable(candidates, process.stdout)
        }
        const report = await runReports(project, {...fileOpts, reportNames, stream: format.reportStream})
        if (opts.surveyDefault) {
            writeReformatMarkdown(report, process.stdout)
            writePrettierMarkdown(report, process.stdout)
        }
        format.finalize(report)
    }
} catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
}

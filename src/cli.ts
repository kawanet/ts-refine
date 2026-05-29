#!/usr/bin/env node

// argv → Project → one report pass, then either runReformat (the
// `reformat` command, write) or Markdown + output finalizer (the `report`
// command, read). parseArgs routes the subcommand and keeps them separate.

import type {TsSurveyReportName} from "@kawanet/ts-survey"

import {selectFormat} from "./format/run-format.ts"
import {initProject, runReformat, runReports} from "./index.ts"
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

const fileOpts = {absIncludes: opts.absIncludes}

// Swallow the Markdown stream in reformat mode; runReformat consumes it.
const NULL_SINK = {write: () => {}}

const isReformat = opts.command === "reformat"

// Library throws (missing tsconfig, unknown report name) become clean
// CLI errors rather than unhandled rejections.
try {
    const project = initProject(opts.tsconfigPath)

    const format = isReformat ? {reportStream: NULL_SINK, finalize: () => {}} : selectFormat(opts.output, process.stdout)

    // Report-name validation lives in runReports so typos surface as a
    // named error there. Cast at the boundary.
    const reportNames = opts.reportNames as TsSurveyReportName[]
    const report = await runReports(project, {...fileOpts, reportNames, stream: format.reportStream})

    if (isReformat) {
        await runReformat(project, {...fileOpts, dryRun: opts.dryRun, report, ...opts.applyOverrides})
    } else {
        // Survey-default appends `## recommendation` + `### .prettierrc`.
        // Named reports and `--output` paths skip both intentionally.
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

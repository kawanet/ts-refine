#!/usr/bin/env node

// argv → Project, then dispatch the subcommand: `list` lists files, `report`
// prints Markdown (+ optional output finalizer), `reformat` writes the
// recommendations to disk. parseArgs routes and keeps the paths separate.

import type {InspectorName, TsSurveyReportName} from "@kawanet/ts-survey"

import {selectOutput} from "./recommend/select-output.ts"
import {writeInspectFile} from "./inspect/format-inspect.ts"
import {initProject, runInspect, runList, runMove, runReformat, runReports} from "./index.ts"
import {filterListEntries, writeListTable} from "./list/format-list.ts"
import {writePrettierMarkdown} from "./recommend/output-prettier.ts"
import {writeReformatMarkdown} from "./recommend/output-ts-refine.ts"
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
// error there. Cast at the boundary (unused by the `list` command).
const reportNames = opts.reportNames as TsSurveyReportName[]

// Library throws (missing tsconfig, unknown report name) become clean
// CLI errors rather than unhandled rejections.
try {
    const project = initProject(opts.tsconfigPath)

    if (opts.command === "list") {
        const entries = await runList(project, fileOpts)
        writeListTable(filterListEntries(entries, opts.listFilters!), process.stdout)
    } else if (opts.command === "inspect") {
        const inspectorNames = opts.inspectorNames! as InspectorName[]
        const files = await runInspect(project, {...fileOpts, inspectorNames})
        for (const file of files) writeInspectFile(file, process.stdout)
    } else if (opts.command === "move") {
        // Move's positionals arrive in opts.paths as a flat list; the
        // dispatch seam splits the destination (last) from the sources
        // (rest) and hands them to runMove.
        const sources = opts.paths.slice(0, -1)
        const dest = opts.paths[opts.paths.length - 1]
        await runMove(project, {sources, dest, dryRun: opts.dryRun})
    } else if (opts.command === "reformat") {
        const report = await runReports(project, {...fileOpts, reportNames, stream: NULL_SINK})
        await runReformat(project, {...fileOpts, dryRun: opts.dryRun, report, ...opts.applyOverrides})
    } else {
        const output = selectOutput(opts.output, process.stdout)
        // The default survey leads with the list cleanup-candidate listing,
        // then the report tables, then `## recommendation` + `### .prettierrc`.
        // Named reports and `--output` paths skip these survey-only blocks.
        if (opts.surveyDefault) {
            const entries = await runList(project, fileOpts)
            const candidates = filterListEntries(entries, {noExports: true, noImporters: true, unusedExports: true})
            process.stdout.write("### list --no-exports --no-importers --unused-exports\n\n")
            writeListTable(candidates, process.stdout)
        }
        const report = await runReports(project, {...fileOpts, reportNames, stream: output.reportStream})
        if (opts.surveyDefault) {
            writeReformatMarkdown(report, process.stdout)
            writePrettierMarkdown(report, process.stdout)
        }
        output.finalize(report)
    }
} catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
}

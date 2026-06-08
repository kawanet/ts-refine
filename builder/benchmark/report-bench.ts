// Report section: time each runReport* pass over the project sources. Each run
// rebuilds the SourceFiles from scratch (cold) like the format section, so the
// two sections measure the same thing. Output is sunk to a no-op writer so only
// the timing table reaches the user.

import {performance} from "node:perf_hooks"
import type {TSR} from "ts-refine"
import {runReportBracketSpacing} from "../../src/report/bracket-spacing.ts"
import {runReportFunctionSpacing} from "../../src/report/function-spacing.ts"
import {runReportIndent} from "../../src/report/indent.ts"
import {runReportMemberDelimiter} from "../../src/report/member-delimiter.ts"
import {runReportNewLine} from "../../src/report/new-line.ts"
import type {ReportRunOpts} from "../../src/report/report-run-opts.ts"
import {runReportSemi} from "../../src/report/semi.ts"
import {runReportTrailingComma} from "../../src/report/trailing-comma.ts"
import type {BenchmarkArgs} from "./parse-benchmark-args.ts"
import {createScratchFiles, type Fixture} from "./scratch.ts"
import {printStatsTable, type StatRow, summarize} from "./stats.ts"

type ReportRun = (opts: ReportRunOpts) => Promise<unknown>

const REPORTS: ReadonlyArray<readonly [string, ReportRun]> = [
    ["semi", runReportSemi],
    ["indent", runReportIndent],
    ["member-delimiter", runReportMemberDelimiter],
    ["new-line", runReportNewLine],
    ["bracket-spacing", runReportBracketSpacing],
    ["trailing-comma", runReportTrailingComma],
    ["function-spacing", runReportFunctionSpacing],
]

const quiet: TSR.Writer = {write: (): void => undefined}

// One timed run over a freshly built (cold) copy of the fixtures. Reports are
// read-only, so the rebuild is purely to keep the cold scope identical to the
// format section rather than to avoid mutation.
async function runOnce(run: ReportRun, fixtures: ReadonlyArray<Fixture>, importsOnly: boolean): Promise<number> {
    const sourceFiles = createScratchFiles(fixtures)
    const opts: ReportRunOpts = {sourceFiles, log: quiet, importsOnly}
    const start = performance.now()
    await run(opts)
    return performance.now() - start
}

export async function runReportBench(args: BenchmarkArgs, fixtures: ReadonlyArray<Fixture>, output: TSR.Writer, log: TSR.Writer): Promise<void> {
    const rows: StatRow[] = []

    for (const [name, run] of REPORTS) {
        log.write(`report: ${name}\n`)

        // One fixed warmup run (the 0th), discarded; then the measured runs.
        await runOnce(run, fixtures, args.importsOnly)
        const samples: number[] = []
        for (let i = 0; i < args.runs; i++) {
            samples.push(await runOnce(run, fixtures, args.importsOnly))
        }

        rows.push({name, runs: samples.length, ...summarize(samples)})
    }

    printStatsTable(output, "report", rows)
}

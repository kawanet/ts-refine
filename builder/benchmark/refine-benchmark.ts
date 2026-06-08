// Benchmark orchestrator: parse args, open the project once, then run the
// report section and the format section against the same source files. Merges
// what used to be two throwaway scripts (report timings and format-pass
// timings) into one builder CLI. Meta and result tables go to `output`; the
// per-pass progress lines go to `log`.

import {performance} from "node:perf_hooks"
import type {CLI} from "../../src/cli/cli-io.ts"
import {resolveProject} from "../../src/common/init-project.ts"
import {selectSourceFiles} from "../../src/lib/source-files.ts"
import {runFormatBench} from "./format-bench.ts"
import {benchmarkUsage, parseBenchmarkArgs} from "./parse-benchmark-args.ts"
import {runReportBench} from "./report-bench.ts"
import {formatMs} from "./stats.ts"

// Reuse the CLI command shape: refineBenchmark is invoked just like the real
// subcommands ({args, tokens, output, log}). The benchmark ignores `args`; it
// reads its own flags from `tokens`.
export const refineBenchmark: CLI = async (ctx) => {
    const {tokens, output, log} = ctx
    const args = parseBenchmarkArgs(tokens)
    if (args.help) {
        output.write(benchmarkUsage() + "\n")
        return 0
    }

    const projectStart = performance.now()
    const project = resolveProject({tsConfigFilePath: args.project})
    const projectMs = performance.now() - projectStart

    const selectStart = performance.now()
    const sourceFiles = selectSourceFiles(project, {paths: args.paths})
    const selectMs = performance.now() - selectStart

    // Capture the loaded text once. Both sections rebuild their own cold scratch
    // copies from these fixtures for every run, so the initial load above is only
    // to read the sources, not part of any measurement.
    const fixtures = sourceFiles.map((sf) => ({path: sf.getFilePath(), text: sf.getFullText()}))

    output.write(`project: ${args.project}\n`)
    output.write(`files: ${fixtures.length}\n`)
    output.write(`setup: project=${formatMs(projectMs)} select=${formatMs(selectMs)}\n`)
    output.write(`runs: ${args.runs} (after 1 warmup) importsOnly=${args.importsOnly}\n`)
    output.write("\n")

    output.write("## report\n")
    await runReportBench(args, fixtures, output, log)
    output.write("\n")

    output.write("## format\n")
    runFormatBench(args, fixtures, output, log)

    return 0
}

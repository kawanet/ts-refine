// Argument parsing for the benchmark CLI. Deliberately small: there is no
// case-selection flag — the benchmark always runs every report and every
// format pass — only knobs for the project, file selection, and run counts.

export interface BenchmarkArgs {
    project: string
    paths: string[]
    runs: number
    importsOnly: boolean
    help: boolean
}

export function parseBenchmarkArgs(tokens: string[]): BenchmarkArgs {
    const parsed: BenchmarkArgs = {
        project: "tsconfig.json",
        paths: [],
        runs: 5,
        importsOnly: false,
        help: false,
    }

    for (let i = 0; i < tokens.length; i++) {
        const arg = tokens[i]
        if (arg === "--project") {
            parsed.project = requireValue(tokens, ++i, arg)
        } else if (arg === "--path") {
            parsed.paths.push(requireValue(tokens, ++i, arg))
        } else if (arg === "--runs") {
            parsed.runs = parsePositiveInt(requireValue(tokens, ++i, arg), arg)
        } else if (arg === "--imports-only") {
            parsed.importsOnly = true
        } else if (arg === "--help" || arg === "-h") {
            parsed.help = true
        } else {
            throw new Error(`unknown argument: ${arg}`)
        }
    }

    return parsed
}

function requireValue(tokens: string[], index: number, flag: string): string {
    const value = tokens[index]
    if (value == null || value.startsWith("--")) throw new Error(`${flag} requires a value`)
    return value
}

function parsePositiveInt(value: string, flag: string): number {
    const n = Number(value)
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`)
    return n
}

export function benchmarkUsage(): string {
    return `Usage: node builder/benchmark.cli.ts [options]

Times every report pass and every format pass against a tsconfig project.
Each run rebuilds the source files from scratch (cold), since that is how the
tool runs in practice; one fixed warmup run is discarded before measuring.
There is no case selection: all passes run on every invocation.

Options:
  --project <path>      tsconfig path to benchmark (default: tsconfig.json)
  --path <glob>         source-file selector passed to the project; repeatable
  --runs <n>            measured runs per pass (default: 5)
  --imports-only        pass importsOnly=true to the report passes
  -h, --help            print this help`
}

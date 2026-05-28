// CLI argument parsing. The entry point is the only place that reads
// process.argv; this module receives the slice as input.
//
// Action categories (mirroring the action/ and report/ directories):
//   action (write): --organize-imports / --indent N / --semicolons on|off
//   report (read) : --report <names>
// Multiple actions can run in one invocation. Actions are exclusive
// with --report / --format (write vs read).
//
// Defaults reflect the "survey" in the package name: when the user
// supplies neither an action nor an explicit --report, every known
// report runs. The tsconfig path defaults to ./tsconfig.json (i.e.
// equivalent to `-p .`).
//
// Project path resolution mirrors `tsc -p`: the value is either a
// `.json` file or a directory containing one. A non-`.json` value is
// treated as a directory and `/tsconfig.json` is appended. There is
// no bare-positional shortcut — every non-flag word is rejected so a
// stray argument doesn't get silently misread as a tsconfig path.
//
// Return value semantics (parseArgs never calls process.exit):
//   - ParsedArgs       — normal parse, ready to dispatch
//   - {help: true}     — user asked for --help / -h
//   - undefined        — argv contained an error; a specific error
//                        message has already been written to stderr

import path from "node:path"

import {reportNames as knownReportNames} from "../report/run-reports.ts"

export interface ParsedArgs {
    organizeImports: boolean
    semicolons: "on" | "off" | null
    indentWidth: number | null
    reportNames: string[]
    format: string | null
    // True when neither an action nor an explicit --report / --format was
    // given. The default-survey path uses this to decide whether to append
    // the `.prettierrc` summary block under the per-report tables.
    surveyDefault: boolean
    tsconfigPath: string
    dryRun: boolean
    absIncludes: string[]
    absExcludes: string[]
}

export interface HelpRequested {
    help: true
}

export type ParseArgsResult = ParsedArgs | HelpRequested

export function parseArgs(argv: string[]): ParseArgsResult | undefined {
    if (argv.includes("--help") || argv.includes("-h")) return {help: true}

    let organizeImports = false
    let semicolons: "on" | "off" | null = null
    let indentWidth: number | null = null
    let format: string | null = null
    let tsconfigPath: string | null = null
    let dryRun = false
    const includeGlobs: string[] = []
    const excludeGlobs: string[] = []
    // Report names accumulate in input order with de-duplication. Both
    // comma-separated values and repeated --report flags are accepted.
    // Whether each name is known is decided by runReports later.
    const requestedReports: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === "--organize-imports") {
            organizeImports = true
        } else if (a === "--semicolons") {
            const v = argv[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--semicolons expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            semicolons = v
        } else if (a === "--indent") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error("--indent requires a positive integer (e.g. --indent 4)")
                return undefined
            }
            const n = Number(v)
            if (!Number.isInteger(n) || n <= 0) {
                console.error(`--indent expects a positive integer; got: ${v}`)
                return undefined
            }
            indentWidth = n
        } else if (a === "--report") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error("--report requires a report name (e.g. --report unused-exports)")
                return undefined
            }
            for (const name of v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)) {
                if (!requestedReports.includes(name)) requestedReports.push(name)
            }
        } else if (a === "--dry-run") {
            dryRun = true
        } else if (a === "--format") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error("--format requires a value (e.g. --format prettier)")
                return undefined
            }
            // Whether the name is known is decided by selectFormat later
            // (mirroring how --report names are validated by runReports).
            format = v
        } else if (a === "--include") {
            const v = takeGlobValue(argv, ++i, "--include")
            if (v === undefined) return undefined
            includeGlobs.push(v)
        } else if (a === "--exclude") {
            const v = takeGlobValue(argv, ++i, "--exclude")
            if (v === undefined) return undefined
            excludeGlobs.push(v)
        } else if (a === "-p" || a === "--project") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error(`${a} requires a path (e.g. ${a} tsconfig.json)`)
                return undefined
            }
            if (tsconfigPath) {
                console.error(`${a} cannot be combined with another tsconfig path`)
                return undefined
            }
            tsconfigPath = v
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            // The tsconfig path goes through -p / --project; bare words
            // are rejected outright so a misspelt flag or stray arg can't
            // silently override the project path.
            console.error(`unexpected argument: ${a} (use -p / --project to set the tsconfig path)`)
            return undefined
        }
    }

    // Validate flag combinations before checking inputs to give actionable errors.
    const hasAction = organizeImports || semicolons !== null || indentWidth !== null
    const hasReport = requestedReports.length > 0
    if (hasAction && hasReport) {
        console.error("action flags cannot be combined with --report")
        return undefined
    }
    if (hasAction && format !== null) {
        console.error("action flags cannot be combined with --format")
        return undefined
    }

    // Default: when neither an action nor an explicit --report was given,
    // run every registered report. This is the "survey" baseline behavior.
    // surveyDefault is true only in the full hands-off state (no action,
    // no --report, no --format); cli.ts reads it to decide whether to
    // append the recommendation / .prettierrc summary blocks.
    const surveyDefault = !hasAction && !hasReport && format === null
    const effectiveReports = !hasAction && !hasReport ? [...knownReportNames] : requestedReports

    // Path resolution mirrors `tsc -p`: a non-`.json` value is read as a
    // directory and `tsconfig.json` is appended. The omitted-path default
    // is equivalent to `-p .`. Existence isn't checked here; initProject()
    // surfaces a missing file as a normal throw caught by the CLI.
    const absTsconfig = resolveTsconfigPath(tsconfigPath ?? ".")

    // Resolve include/exclude globs against the tsconfig directory so the same
    // command yields the same target set regardless of cwd.
    const tsconfigDir = path.dirname(absTsconfig)
    const absIncludes = includeGlobs.map((g) => resolveGlob(g, tsconfigDir))
    const absExcludes = excludeGlobs.map((g) => resolveGlob(g, tsconfigDir))

    return {
        organizeImports,
        semicolons,
        indentWidth,
        reportNames: effectiveReports,
        format,
        surveyDefault,
        tsconfigPath: absTsconfig,
        dryRun,
        absIncludes,
        absExcludes,
    }
}

function takeGlobValue(args: string[], idx: number, optName: string): string | undefined {
    const v = args[idx]
    if (!v || v.startsWith("-")) {
        console.error(`${optName} requires a glob value`)
        return undefined
    }
    return v
}

function resolveGlob(pattern: string, baseDir: string): string {
    if (path.isAbsolute(pattern)) return pattern
    return path.resolve(baseDir, pattern)
}

// Mirrors `tsc -p`: a `.json` value is read as a file path, anything
// else is read as a directory and `tsconfig.json` is appended. This
// makes `-p .` equivalent to the omitted-path default.
function resolveTsconfigPath(input: string): string {
    const absolute = path.resolve(input)
    if (input.endsWith(".json")) return absolute
    return path.join(absolute, "tsconfig.json")
}

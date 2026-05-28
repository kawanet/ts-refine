// CLI argument parsing. The entry point is the only place that reads
// process.argv; this module receives the slice as input.
//
// Action categories (mirroring the action/ and report/ directories):
//   action (write): --organize-imports / --remove-semicolons / --insert-semicolons
//   report (read) : --report <names>
// Multiple actions can run in one invocation. Actions are exclusive with
// --report / --format (write vs read). --remove-semicolons and
// --insert-semicolons are mutually exclusive.
//
// Defaults reflect the "survey" in the package name: when the user
// supplies neither an action nor an explicit --report, every known
// report runs. The tsconfig path defaults to ./tsconfig.json.
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
    removeSemicolons: boolean
    insertSemicolons: boolean
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
    let removeSemicolons = false
    let insertSemicolons = false
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
        } else if (a === "--remove-semicolons") {
            removeSemicolons = true
        } else if (a === "--insert-semicolons") {
            insertSemicolons = true
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
        } else if (a.startsWith("--")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else if (!tsconfigPath) {
            tsconfigPath = a
        } else {
            console.error(`extra argument: ${a}`)
            return undefined
        }
    }

    // Validate flag combinations before checking inputs to give actionable errors.
    if (removeSemicolons && insertSemicolons) {
        console.error("--remove-semicolons and --insert-semicolons are mutually exclusive")
        return undefined
    }
    const hasAction = organizeImports || removeSemicolons || insertSemicolons || indentWidth !== null
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
    // surveyDefault は --format も未指定であることまで含めた「全部おまかせ」
    // 状態だけ true にする — cli.ts はこれを見て .prettierrc 要約ブロックを差し込む。
    const surveyDefault = !hasAction && !hasReport && format === null
    const effectiveReports = !hasAction && !hasReport ? [...knownReportNames] : requestedReports

    // Default to ./tsconfig.json in the current working directory when the
    // path is omitted. Existence is not checked here; initProject() surfaces
    // a missing file as a normal throw caught by the CLI.
    const absTsconfig = path.resolve(tsconfigPath ?? "tsconfig.json")

    // Resolve include/exclude globs against the tsconfig directory so the same
    // command yields the same target set regardless of cwd.
    const tsconfigDir = path.dirname(absTsconfig)
    const absIncludes = includeGlobs.map((g) => resolveGlob(g, tsconfigDir))
    const absExcludes = excludeGlobs.map((g) => resolveGlob(g, tsconfigDir))

    return {
        organizeImports,
        removeSemicolons,
        insertSemicolons,
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

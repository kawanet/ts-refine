// CLI argument parsing. The entry point is the only place that reads
// process.argv; this module receives the slice as input.
//
// Action categories (mirroring the action/ and report/ directories):
//   action (write): --organize-imports / --remove-semicolons / --insert-semicolons
//   report (read) : --report <names>
// Multiple actions can run in one invocation. Reports are exclusive with
// actions. --remove-semicolons and --insert-semicolons are mutually exclusive.
//
// Return value semantics (parseArgs never calls process.exit):
//   - ParsedArgs       — normal parse, ready to dispatch
//   - {help: true}     — user asked for --help / -h
//   - undefined        — argv was empty or contained an error; a specific
//                        error message has already been written to stderr
// cli.ts maps these onto the right exit code and stream.

import fs from "node:fs/promises"
import path from "node:path"

export interface ParsedArgs {
    organizeImports: boolean
    removeSemicolons: boolean
    insertSemicolons: boolean
    reportNames: string[]
    tsconfigPath: string
    dryRun: boolean
    absIncludes: string[]
    absExcludes: string[]
}

export interface HelpRequested {
    help: true
}

export type ParseArgsResult = ParsedArgs | HelpRequested

export async function parseArgs(argv: string[]): Promise<ParseArgsResult | undefined> {
    if (argv.includes("--help") || argv.includes("-h")) return {help: true}
    if (argv.length === 0) return undefined

    let organizeImports = false
    let removeSemicolons = false
    let insertSemicolons = false
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
    const hasAction = organizeImports || removeSemicolons || insertSemicolons
    const hasReport = requestedReports.length > 0
    if (hasAction && hasReport) {
        console.error("action flags (--organize-imports / --remove-semicolons / --insert-semicolons) cannot be combined with --report")
        return undefined
    }
    if (!hasAction && !hasReport) {
        console.error("no action specified")
        return undefined
    }
    if (!tsconfigPath) {
        console.error("missing tsconfig.json path")
        return undefined
    }

    const absTsconfig = path.resolve(tsconfigPath)
    try {
        await fs.access(absTsconfig)
    } catch {
        console.error(`tsconfig not found: ${absTsconfig}`)
        return undefined
    }

    // Resolve include/exclude globs against the tsconfig directory so the same
    // command yields the same target set regardless of cwd.
    const tsconfigDir = path.dirname(absTsconfig)
    const absIncludes = includeGlobs.map((g) => resolveGlob(g, tsconfigDir))
    const absExcludes = excludeGlobs.map((g) => resolveGlob(g, tsconfigDir))

    return {
        organizeImports,
        removeSemicolons,
        insertSemicolons,
        reportNames: requestedReports,
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

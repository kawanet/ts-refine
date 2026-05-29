// argv → ParsedArgs. Subcommand grammar:
//   ts-survey [help | report [names...] | reformat] [--options]
// The first non-dash token is the subcommand; remaining non-dash tokens
// are collected as positionals (report names today, file args later), so
// the same parser shape serves the planned ls / mv / inspect commands.

import path from "node:path"

import {applyReportNames, reportNames as knownReportNames} from "../report/report-names.ts"

// `newLine` is narrowed to lf|crlf because LS cannot emit CR-only.
export interface ApplyOverrides {
    organizeImports?: "on" | "off"
    indent?: number | "tab"
    semicolons?: "on" | "off"
    newLine?: "lf" | "crlf"
    bracketSpacing?: "on" | "off"
}

type Command = "report" | "reformat"

interface ParsedArgs {
    command: Command
    // For report: the requested names (positionals) or the full registry.
    // For reformat: the recommendation-bearing reports runReformat consumes.
    reportNames: string[]
    // report-only: suppress Markdown and emit the named output instead.
    output: string | null
    applyOverrides: ApplyOverrides
    // True only for a bare `report` (no names, no --output); gates the
    // recommendation + .prettierrc blocks under the per-report Markdown.
    surveyDefault: boolean
    tsconfigPath: string
    dryRun: boolean
    absIncludes: string[]
    absExcludes: string[]
}

interface HelpRequested {
    help: true
}

type ParseArgsResult = ParsedArgs | HelpRequested

// Raw scan result: the subcommand plus accumulated options, before any
// command-presence / mode-consistency checks. Per-value validation
// (on/off, positive int, etc.) already happened during the scan.
interface RawArgs {
    command: string | null
    positionals: string[]
    overrides: ApplyOverrides
    output: string | null
    tsconfigPath: string | null
    dryRun: boolean
    includeGlobs: string[]
    excludeGlobs: string[]
}

export function parseArgs(argv: string[]): ParseArgsResult | undefined {
    // `help` is the canonical spelling; -h / --help are aliases that win
    // wherever they appear (including after a subcommand).
    if (argv.includes("--help") || argv.includes("-h")) return {help: true}

    const raw = scanArgs(argv)
    if (raw === undefined) return undefined
    return resolveArgs(raw)
}

// Front half: argv → RawArgs. Walks the tokens, validates each option's
// value, and collects the first bare token as the command and the rest
// as positionals. Returns undefined on a value error (stderr written).
function scanArgs(argv: string[]): RawArgs | undefined {
    let command: string | null = null
    const positionals: string[] = []
    const overrides: ApplyOverrides = {}
    let output: string | null = null
    let tsconfigPath: string | null = null
    let dryRun = false
    const includeGlobs: string[] = []
    const excludeGlobs: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === "--organize-imports") {
            const v = argv[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--organize-imports expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.organizeImports = v
        } else if (a === "--semicolons") {
            const v = argv[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--semicolons expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.semicolons = v
        } else if (a === "--indent") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error("--indent requires a positive integer or 'tab' (e.g. --indent 4)")
                return undefined
            }
            // "tab" maps to tab indentation; otherwise a positive integer.
            if (v === "tab") {
                overrides.indent = "tab"
            } else {
                const n = Number(v)
                if (!Number.isInteger(n) || n <= 0) {
                    console.error(`--indent expects a positive integer or 'tab'; got: ${v}`)
                    return undefined
                }
                overrides.indent = n
            }
        } else if (a === "--new-line") {
            // `cr` rejected: LS formatter accepts \n / \r\n only.
            const v = argv[++i]
            if (v !== "lf" && v !== "crlf") {
                console.error(`--new-line expects 'lf' or 'crlf'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.newLine = v
        } else if (a === "--bracket-spacing") {
            const v = argv[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--bracket-spacing expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.bracketSpacing = v
        } else if (a === "--output") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error("--output requires a value (e.g. --output prettier)")
                return undefined
            }
            // Name validation lives in selectFormat (same pattern as report names).
            output = v
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
        } else if (command === null) {
            // First bare token is the subcommand; the rest are positionals.
            command = a
        } else {
            positionals.push(a)
        }
    }

    return {command, positionals, overrides, output, tsconfigPath, dryRun, includeGlobs, excludeGlobs}
}

// Back half: RawArgs → ParsedArgs. Command-presence + mode-consistency
// checks, then resolves the report set and the glob / tsconfig paths.
function resolveArgs(raw: RawArgs): ParseArgsResult | undefined {
    const {command, positionals, overrides, output, tsconfigPath, dryRun, includeGlobs, excludeGlobs} = raw

    // No subcommand: bare invocation is help; options without a command
    // are a usage error so a misplaced flag can't silently do nothing.
    if (command === null) {
        const sawOption = output !== null || dryRun || Object.keys(overrides).length > 0 || includeGlobs.length > 0 || excludeGlobs.length > 0 || tsconfigPath !== null
        if (sawOption) {
            console.error("expected a subcommand: report, format, or help")
            return undefined
        }
        return {help: true}
    }
    if (command === "help") return {help: true}
    if (command !== "report" && command !== "reformat") {
        console.error(`unknown command: ${command} (expected: report, reformat, help)`)
        return undefined
    }

    // Mode-specific option checks so a misplaced flag fails loudly.
    if (command === "report") {
        if (Object.keys(overrides).length > 0) {
            console.error("apply overrides (--indent, --semicolons, etc.) are only valid with `reformat`")
            return undefined
        }
        if (dryRun) {
            console.error("--dry-run is only valid with `reformat`")
            return undefined
        }
    } else {
        if (output !== null) {
            console.error("--output is only valid with `report`")
            return undefined
        }
        if (positionals.length > 0) {
            console.error(`reformat takes no positional arguments; got: ${positionals.join(" ")}`)
            return undefined
        }
    }

    // report names: positionals (de-duplicated in order) or the full
    // registry. reformat always runs the recommendation-bearing set.
    // Name validation stays in runReports (runtime), not here.
    let reportNames: string[]
    let surveyDefault = false
    if (command === "reformat") {
        reportNames = [...applyReportNames]
    } else if (positionals.length > 0) {
        reportNames = []
        for (const name of positionals) {
            if (!reportNames.includes(name)) reportNames.push(name)
        }
    } else {
        reportNames = [...knownReportNames]
        surveyDefault = output === null
    }

    const absTsconfig = resolveTsconfigPath(tsconfigPath ?? ".")

    // Resolve globs against the tsconfig dir so cwd doesn't shift the target set.
    const tsconfigDir = path.dirname(absTsconfig)
    const absIncludes = includeGlobs.map((g) => resolveGlob(g, tsconfigDir))
    const absExcludes = excludeGlobs.map((g) => resolveGlob(g, tsconfigDir))

    return {
        command,
        reportNames,
        output,
        applyOverrides: overrides,
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

// Mirrors `tsc -p`: a non-`.json` value is treated as a directory and
// `tsconfig.json` is appended.
function resolveTsconfigPath(input: string): string {
    const absolute = path.resolve(input)
    if (input.endsWith(".json")) return absolute
    return path.join(absolute, "tsconfig.json")
}

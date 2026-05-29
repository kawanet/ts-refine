// argv → ParsedArgs. Subcommand grammar; the subcommand must be the first
// argument (git-style), which lets each command define its own flag set
// and arity:
//   ts-survey help
//   ts-survey report [--<report>...] [files...] [--output <name>] [-p tsconfig]
//   ts-survey reformat [--indent N|tab ...] [files...] [-p tsconfig] [--dry-run]
// Any non-dash argument after the subcommand is a file path (globs allowed),
// forwarded to ts-morph. Report-name validation stays in runReports.

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
    // For report: the requested selectors or the full registry.
    // For reformat: the recommendation-bearing reports runReformat consumes.
    reportNames: string[]
    // report-only: suppress Markdown and emit the named output instead.
    output: string | null
    applyOverrides: ApplyOverrides
    // True only for a bare `report` (no selectors, no --output); gates the
    // recommendation + .prettierrc blocks under the per-report Markdown.
    surveyDefault: boolean
    tsconfigPath: string
    dryRun: boolean
    // Positional file arguments, resolved to absolute (globs allowed).
    paths: string[]
}

interface HelpRequested {
    help: true
}

type ParseArgsResult = ParsedArgs | HelpRequested

export function parseArgs(argv: string[]): ParseArgsResult | undefined {
    // `help` is the canonical spelling; -h / --help are aliases that win
    // wherever they appear (including after a subcommand).
    if (argv.includes("--help") || argv.includes("-h")) return {help: true}

    const [command, ...rest] = argv
    if (command === undefined || command === "help") return {help: true}
    if (command === "report") return parseReport(rest)
    if (command === "reformat") return parseReformat(rest)
    if (command.startsWith("-")) {
        console.error("expected a subcommand: report, reformat, or help")
        return undefined
    }
    console.error(`unknown command: ${command} (expected: report, reformat, help)`)
    return undefined
}

// `report`: collect report-name selectors (`--<report>`), the optional
// `--output`, and positional files. Unknown `--<name>` is treated as a
// report selector (validated later by runReports), matching how the old
// positional report names behaved.
function parseReport(rest: string[]): ParseArgsResult | undefined {
    const reportNames: string[] = []
    const files: string[] = []
    let output: string | null = null
    let tsconfigPath: string | null = null

    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === "--output") {
            const v = rest[++i]
            if (!v || v.startsWith("-")) {
                console.error("--output requires a value (e.g. --output prettier)")
                return undefined
            }
            output = v
        } else if (a === "-p" || a === "--project") {
            const v = takeProject(rest, ++i, a, tsconfigPath)
            if (v === undefined) return undefined
            tsconfigPath = v
        } else if (a.startsWith("--")) {
            const name = a.slice(2)
            if (!reportNames.includes(name)) reportNames.push(name)
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            files.push(a)
        }
    }

    const surveyDefault = reportNames.length === 0 && output === null
    const effectiveReports = reportNames.length > 0 ? reportNames : [...knownReportNames]
    const {absTsconfig, paths} = resolvePaths(tsconfigPath, files)
    return {command: "report", reportNames: effectiveReports, output, applyOverrides: {}, surveyDefault, tsconfigPath: absTsconfig, dryRun: false, paths}
}

// `reformat`: a fixed set of override options plus positional files.
function parseReformat(rest: string[]): ParseArgsResult | undefined {
    const overrides: ApplyOverrides = {}
    const files: string[] = []
    let tsconfigPath: string | null = null
    let dryRun = false

    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]
        if (a === "--organize-imports") {
            const v = rest[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--organize-imports expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.organizeImports = v
        } else if (a === "--semicolons") {
            const v = rest[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--semicolons expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.semicolons = v
        } else if (a === "--indent") {
            const v = rest[++i]
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
            const v = rest[++i]
            if (v !== "lf" && v !== "crlf") {
                console.error(`--new-line expects 'lf' or 'crlf'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.newLine = v
        } else if (a === "--bracket-spacing") {
            const v = rest[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--bracket-spacing expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.bracketSpacing = v
        } else if (a === "--dry-run") {
            dryRun = true
        } else if (a === "-p" || a === "--project") {
            const v = takeProject(rest, ++i, a, tsconfigPath)
            if (v === undefined) return undefined
            tsconfigPath = v
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            files.push(a)
        }
    }

    const {absTsconfig, paths} = resolvePaths(tsconfigPath, files)
    return {command: "reformat", reportNames: [...applyReportNames], output: null, applyOverrides: overrides, surveyDefault: false, tsconfigPath: absTsconfig, dryRun, paths}
}

function takeProject(args: string[], idx: number, optName: string, existing: string | null): string | undefined {
    const v = args[idx]
    if (!v || v.startsWith("-")) {
        console.error(`${optName} requires a path (e.g. ${optName} tsconfig.json)`)
        return undefined
    }
    if (existing) {
        console.error(`${optName} cannot be combined with another tsconfig path`)
        return undefined
    }
    return v
}

// Resolve the tsconfig path and the positional files. Files are resolved
// against the tsconfig dir (not cwd) so the target set doesn't shift with
// the working directory — same basis the removed --include used.
function resolvePaths(tsconfigPath: string | null, files: string[]): {absTsconfig: string; paths: string[]} {
    const absTsconfig = resolveTsconfigPath(tsconfigPath ?? ".")
    const tsconfigDir = path.dirname(absTsconfig)
    const paths = files.map((g) => (path.isAbsolute(g) ? g : path.resolve(tsconfigDir, g)))
    return {absTsconfig, paths}
}

// Mirrors `tsc -p`: a non-`.json` value is treated as a directory and
// `tsconfig.json` is appended.
function resolveTsconfigPath(input: string): string {
    const absolute = path.resolve(input)
    if (input.endsWith(".json")) return absolute
    return path.join(absolute, "tsconfig.json")
}

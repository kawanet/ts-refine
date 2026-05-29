// argv → ParsedArgs. Two modes (report / apply) are mutually exclusive;
// any apply-side override implicitly enables --apply, mirroring how
// --format implies --report. tsconfig path mirrors `tsc -p`.

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

interface ParsedArgs {
    apply: boolean
    applyOverrides: ApplyOverrides
    reportNames: string[]
    format: string | null
    // True only when nothing was specified; gates the recommendation +
    // .prettierrc blocks under the per-report Markdown.
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

export function parseArgs(argv: string[]): ParseArgsResult | undefined {
    if (argv.includes("--help") || argv.includes("-h")) return {help: true}

    let applyExplicit = false
    const overrides: ApplyOverrides = {}
    let format: string | null = null
    let tsconfigPath: string | null = null
    let dryRun = false
    const includeGlobs: string[] = []
    const excludeGlobs: string[] = []
    // De-duplicated in input order. Name validation lives in runReports.
    const requestedReports: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === "--apply") {
            applyExplicit = true
        } else if (a === "--organize-imports") {
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
            // Name validation lives in selectFormat (same pattern as --report).
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
            // Bare words rejected so a misspelt flag can't become a path.
            console.error(`unexpected argument: ${a} (use -p / --project to set the tsconfig path)`)
            return undefined
        }
    }

    const hasOverride = Object.keys(overrides).length > 0
    const apply = applyExplicit || hasOverride
    const hasReport = requestedReports.length > 0
    const hasFormat = format !== null
    if (apply && hasReport) {
        console.error("apply flags (--apply and per-field overrides) cannot be combined with --report")
        return undefined
    }
    if (apply && hasFormat) {
        console.error("apply flags (--apply and per-field overrides) cannot be combined with --format")
        return undefined
    }

    // surveyDefault gates the recommendation / .prettierrc summary blocks
    // in cli.ts. With no --report, --apply takes applyReportNames only;
    // other modes take the full union.
    const surveyDefault = !apply && !hasReport && !hasFormat
    const effectiveReports = hasReport ? requestedReports : apply ? [...applyReportNames] : [...knownReportNames]

    const absTsconfig = resolveTsconfigPath(tsconfigPath ?? ".")

    // Resolve globs against the tsconfig dir so cwd doesn't shift the target set.
    const tsconfigDir = path.dirname(absTsconfig)
    const absIncludes = includeGlobs.map((g) => resolveGlob(g, tsconfigDir))
    const absExcludes = excludeGlobs.map((g) => resolveGlob(g, tsconfigDir))

    return {
        apply,
        applyOverrides: overrides,
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

// Mirrors `tsc -p`: a non-`.json` value is treated as a directory and
// `tsconfig.json` is appended.
function resolveTsconfigPath(input: string): string {
    const absolute = path.resolve(input)
    if (input.endsWith(".json")) return absolute
    return path.join(absolute, "tsconfig.json")
}

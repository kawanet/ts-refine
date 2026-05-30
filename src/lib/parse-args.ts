// argv → ParsedArgs. Subcommand grammar (git-style):
//   ts-refine [global...] <command> [command args...] [global...]
//
// Global options may appear on either side of the subcommand:
//   -p / --project <path>   shared by every command
//   --dry-run               applies to the write commands (format, move)
//   -h / --help             shown anywhere
// Command-specific options (--output, --semicolons, --no-exports, report /
// inspector selectors, ...) stay to the RIGHT of the subcommand.
//
// Per command, after the globals are pulled out:
//   report   [--<report>...] [files...] [--output <name>]
//   format   [--indent N|tab ...] [files...]
//   list     [--no-exports] [--no-importers] [--unused-exports] [files...]
//   inspect  [--<inspector>...] [files...]
//   move     <source...> <dest>
// Any non-dash argument after the subcommand is a file path (globs allowed,
// except move where the last positional is the destination). Selector
// validation stays in the runner.

import path from "node:path"

import {inspectorNames as knownInspectorNames} from "../inspect/inspector-names.ts"
import {applyReportNames, reportNames as knownReportNames} from "../report/report-names.ts"

// `newLine` is narrowed to lf|crlf because LS cannot emit CR-only.
export interface ApplyOverrides {
    organizeImports?: "on" | "off"
    indent?: number | "tab"
    semicolons?: "on" | "off"
    newLine?: "lf" | "crlf"
    bracketSpacing?: "on" | "off"
}

type Command = "report" | "format" | "list" | "inspect" | "move" | "rename"

const COMMANDS: readonly Command[] = ["report", "format", "list", "inspect", "move", "rename"] as const

// `list` filter flags; OR-combined when more than one is set.
interface ListFilters {
    noExports: boolean
    noImporters: boolean
    unusedExports: boolean
}

interface ParsedArgs {
    command: Command
    // For report: the requested selectors or the full registry.
    // For format: the recommendation-bearing reports runFormat consumes.
    reportNames: string[]
    // inspect-only: the requested inspector selectors, or the full registry.
    inspectorNames?: string[]
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
    // list-only: which cleanup-candidate filters were requested.
    listFilters?: ListFilters
    // rename-only: the identifier to rename and its replacement, plus an
    // optional file (absolute) that scopes the lookup to its exports.
    from?: string
    to?: string
    renameFile?: string | null
}

interface HelpRequested {
    help: true
}

type ParseArgsResult = ParsedArgs | HelpRequested

// Global options collected position-independently, plus the leftover
// tokens (the subcommand and its own arguments, in order).
interface Globals {
    tsconfigPath: string | null
    dryRun: boolean
    rest: string[]
}

export function parseArgs(argv: string[]): ParseArgsResult | undefined {
    // `help` is the canonical spelling; -h / --help are aliases that win
    // wherever they appear (a global option, like the rest below).
    if (argv.includes("--help") || argv.includes("-h")) return {help: true}

    const globals = extractGlobals(argv)
    if (globals === undefined) return undefined
    const [command, ...sub] = globals.rest

    if (command === undefined) {
        // Bare invocation is help; globals with no subcommand is a usage error.
        if (globals.tsconfigPath !== null || globals.dryRun) {
            console.error("expected a subcommand: report, format, list, inspect, move, rename, or help")
            return undefined
        }
        return {help: true}
    }
    if (command === "help") return {help: true}
    if (!(COMMANDS as readonly string[]).includes(command)) {
        if (command.startsWith("-")) {
            console.error("expected a subcommand: report, format, list, inspect, move, rename, or help")
        } else {
            console.error(`unknown command: ${command} (expected: report, format, list, inspect, move, rename, help)`)
        }
        return undefined
    }

    // --dry-run only means something for the write commands.
    if (globals.dryRun && command !== "format" && command !== "move" && command !== "rename") {
        console.error("--dry-run is only valid with format, move, or rename")
        return undefined
    }

    switch (command as Command) {
        case "report":
            return parseReport(sub, globals)
        case "format":
            return parseReformat(sub, globals)
        case "list":
            return parseList(sub, globals)
        case "inspect":
            return parseInspect(sub, globals)
        case "move":
            return parseMove(sub, globals)
        case "rename":
            return parseRename(sub, globals)
    }
}

// Pulls the global options out of argv regardless of position, leaving the
// subcommand and its own args in `rest`. `-p` given more than once (on
// either side) is an error; `--dry-run` repeated is idempotent. So the
// three duplicate shapes — left+left, left+right, right+right — behave
// identically, which is the whole point of treating these as positionless.
function extractGlobals(argv: string[]): Globals | undefined {
    let tsconfigPath: string | null = null
    let dryRun = false
    const rest: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === "-p" || a === "--project") {
            const v = argv[++i]
            if (!v || v.startsWith("-")) {
                console.error(`${a} requires a path (e.g. ${a} tsconfig.json)`)
                return undefined
            }
            if (tsconfigPath !== null) {
                console.error(`${a} cannot be combined with another tsconfig path`)
                return undefined
            }
            tsconfigPath = v
        } else if (a === "--dry-run") {
            dryRun = true
        } else {
            rest.push(a)
        }
    }

    return {tsconfigPath, dryRun, rest}
}

// `move`: positional args are `<source...> <dest>` — the parser only
// validates the count and stores them as `paths`; the cli/dispatch layer
// splits the list (last element → dest, the rest → sources) and hands
// them to runMove.
function parseMove(sub: string[], globals: Globals): ParseArgsResult | undefined {
    const files: string[] = []
    for (const a of sub) {
        if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        }
        files.push(a)
    }

    if (files.length < 2) {
        console.error("move requires at least one source and a destination (e.g. move foo.ts dest/)")
        return undefined
    }

    const {absTsconfig, paths} = resolvePaths(globals.tsconfigPath, files)
    return {command: "move", reportNames: [], output: null, applyOverrides: {}, surveyDefault: false, tsconfigPath: absTsconfig, dryRun: globals.dryRun, paths}
}

// `rename`: rename an exported identifier. --from / --to are required; an
// optional positional file scopes the lookup to that file's exports.
function parseRename(sub: string[], globals: Globals): ParseArgsResult | undefined {
    let from: string | undefined
    let to: string | undefined
    const files: string[] = []

    for (let i = 0; i < sub.length; i++) {
        const a = sub[i]
        if (a === "--from") {
            from = sub[++i]
            if (!from || from.startsWith("-")) {
                console.error("--from requires an identifier (e.g. --from oldName)")
                return undefined
            }
        } else if (a === "--to") {
            to = sub[++i]
            if (!to || to.startsWith("-")) {
                console.error("--to requires an identifier (e.g. --to newName)")
                return undefined
            }
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            files.push(a)
        }
    }

    if (from === undefined || to === undefined) {
        console.error("rename requires --from <name> and --to <name>")
        return undefined
    }
    if (files.length > 1) {
        console.error("rename accepts at most one file to scope the lookup")
        return undefined
    }

    const {absTsconfig, paths} = resolvePaths(globals.tsconfigPath, files)
    return {command: "rename", from, to, renameFile: paths[0] ?? null, reportNames: [], output: null, applyOverrides: {}, surveyDefault: false, tsconfigPath: absTsconfig, dryRun: globals.dryRun, paths: []}
}

// `inspect`: per-file analysis. `--<inspector>` flags select which
// inspectors run (default: all). Unknown `--<name>` becomes a selector
// and is validated at runtime by runInspect (mirrors parseReport).
function parseInspect(sub: string[], globals: Globals): ParseArgsResult | undefined {
    const inspectorNames: string[] = []
    const files: string[] = []

    for (const a of sub) {
        if (a.startsWith("--")) {
            const name = a.slice(2)
            if (!inspectorNames.includes(name)) inspectorNames.push(name)
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            files.push(a)
        }
    }

    const effective = inspectorNames.length > 0 ? inspectorNames : [...knownInspectorNames]
    const {absTsconfig, paths} = resolvePaths(globals.tsconfigPath, files)
    return {command: "inspect", reportNames: [], inspectorNames: effective, output: null, applyOverrides: {}, surveyDefault: false, tsconfigPath: absTsconfig, dryRun: false, paths}
}

// `list`: cleanup-candidate filters plus positional files. Each flag is a
// boolean; multiple are OR-combined downstream.
function parseList(sub: string[], globals: Globals): ParseArgsResult | undefined {
    const files: string[] = []
    let noExports = false
    let noImporters = false
    let unusedExports = false

    for (const a of sub) {
        if (a === "--no-exports") {
            noExports = true
        } else if (a === "--no-importers") {
            noImporters = true
        } else if (a === "--unused-exports") {
            unusedExports = true
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            files.push(a)
        }
    }

    const {absTsconfig, paths} = resolvePaths(globals.tsconfigPath, files)
    return {command: "list", reportNames: [], output: null, applyOverrides: {}, surveyDefault: false, tsconfigPath: absTsconfig, dryRun: false, paths, listFilters: {noExports, noImporters, unusedExports}}
}

// `report`: collect report-name selectors (`--<report>`), the optional
// `--output`, and positional files. Unknown `--<name>` is treated as a
// report selector (validated later by runReports), matching how the old
// positional report names behaved.
function parseReport(sub: string[], globals: Globals): ParseArgsResult | undefined {
    const reportNames: string[] = []
    const files: string[] = []
    let output: string | null = null

    for (let i = 0; i < sub.length; i++) {
        const a = sub[i]
        if (a === "--output") {
            const v = sub[++i]
            if (!v || v.startsWith("-")) {
                console.error("--output requires a value (e.g. --output prettier)")
                return undefined
            }
            output = v
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
    const {absTsconfig, paths} = resolvePaths(globals.tsconfigPath, files)
    return {command: "report", reportNames: effectiveReports, output, applyOverrides: {}, surveyDefault, tsconfigPath: absTsconfig, dryRun: false, paths}
}

// `format`: a fixed set of override options plus positional files.
function parseReformat(sub: string[], globals: Globals): ParseArgsResult | undefined {
    const overrides: ApplyOverrides = {}
    const files: string[] = []

    for (let i = 0; i < sub.length; i++) {
        const a = sub[i]
        if (a === "--organize-imports") {
            const v = sub[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--organize-imports expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.organizeImports = v
        } else if (a === "--semicolons") {
            const v = sub[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--semicolons expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.semicolons = v
        } else if (a === "--indent") {
            const v = sub[++i]
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
            const v = sub[++i]
            if (v !== "lf" && v !== "crlf") {
                console.error(`--new-line expects 'lf' or 'crlf'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.newLine = v
        } else if (a === "--bracket-spacing") {
            const v = sub[++i]
            if (v !== "on" && v !== "off") {
                console.error(`--bracket-spacing expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.bracketSpacing = v
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            files.push(a)
        }
    }

    const {absTsconfig, paths} = resolvePaths(globals.tsconfigPath, files)
    return {command: "format", reportNames: [...applyReportNames], output: null, applyOverrides: overrides, surveyDefault: false, tsconfigPath: absTsconfig, dryRun: globals.dryRun, paths}
}

// Resolve the tsconfig path and the positional files. Files are resolved
// against the tsconfig dir (not cwd) so the target set doesn't shift with
// the working directory — same basis the removed --include used. A
// trailing `/` on the input survives the resolve (move uses it as a
// "this is a directory" hint).
function resolvePaths(tsconfigPath: string | null, files: string[]): {absTsconfig: string; paths: string[]} {
    const absTsconfig = resolveTsconfigPath(tsconfigPath ?? ".")
    const tsconfigDir = path.dirname(absTsconfig)
    const paths = files.map((g) => {
        const absolute = path.isAbsolute(g) ? g : path.resolve(tsconfigDir, g)
        return g.endsWith("/") || g.endsWith(path.sep) ? absolute + path.sep : absolute
    })
    return {absTsconfig, paths}
}

// Mirrors `tsc -p`: a non-`.json` value is treated as a directory and
// `tsconfig.json` is appended.
function resolveTsconfigPath(input: string): string {
    const absolute = path.resolve(input)
    if (input.endsWith(".json")) return absolute
    return path.join(absolute, "tsconfig.json")
}

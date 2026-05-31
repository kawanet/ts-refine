// refineCLI is the whole CLI as a function: consume the leading global options
// up to the subcommand, then hand the remaining tokens to the matching command
// handler in COMMAND_TABLE. Each handler parses its own options (calling
// parseCommonArgs for any trailing globals), opens the project, and runs.
// refineCLI writes stdout-bound output to `stream`, resolves with the process
// exit status, and never calls process.exit or rejects.
//
// Diagnostics and per-command progress stay on console.error / the runners'
// own console output, which already target the process's stderr/stdout.

import {type CommonArgs, parseCommonArgs} from "./args-common.ts"
import type {CLIStream} from "./cli-io.ts"
import {runFormat} from "./format/format-cli.ts"
import {runInspect} from "./inspect/inspect-cli.ts"
import {runList} from "./list/list-cli.ts"
import {runMove} from "./move/move-cli.ts"
import {runRename} from "./rename/rename-cli.ts"
import {runReport} from "./report/report-cli.ts"
import {usage} from "./usage.ts"

// A command handler parses its own tokens (using `common` for globals), opens
// the project, runs, and resolves with the exit status. Read-only commands
// ignore `stream` only by taking fewer parameters.
type CommandHandler = (sub: string[], common: CommonArgs, stream: CLIStream) => Promise<number>

// The command table is the single source of truth for the set of subcommands:
// membership here is what makes a name valid. Insertion order also drives the
// accepted-subcommand error message.
const COMMAND_TABLE = new Map<string, CommandHandler>([
    ["report", runReport],
    ["format", runFormat],
    ["list", runList],
    ["inspect", runInspect],
    ["move", runMove],
    ["rename", runRename],
])

function acceptedSubcommands(): string {
    return [...COMMAND_TABLE.keys(), "help"].join(", ")
}

// The whole CLI as a function: parse `args` (argv minus node/script),
// dispatch the subcommand writing stdout-bound output to `stream`, and
// resolve with the process exit status (0 ok, 1 on error). Never throws.
type refineCLI = (args: string[], stream: CLIStream) => Promise<number>

export const refineCLI: refineCLI = async (args, stream) => {
    // -h / --help win wherever they appear; `help` and a bare invocation also
    // print usage.
    if (args.includes("--help") || args.includes("-h")) {
        stream.write(usage() + "\n")
        return 0
    }

    // Consume the leading globals; the first token that isn't one is the
    // subcommand, and the tokens to its right go to that command's handler.
    const common: CommonArgs = {tsconfigPath: null, dryRun: false}
    let i = 0
    let command: string | undefined
    while (i < args.length) {
        const consumed = parseCommonArgs(common, args, i)
        if (consumed < 0) {
            // A global option was malformed; stderr already explains it.
            console.error(usage())
            return 1
        }
        if (consumed === 0) {
            command = args[i]
            i++
            break
        }
        i += consumed
    }

    if (command === undefined) {
        // Bare invocation is help; globals with no subcommand is a usage error.
        if (common.tsconfigPath !== null || common.dryRun) {
            console.error(`expected a subcommand: ${acceptedSubcommands()}`)
            console.error(usage())
            return 1
        }
        stream.write(usage() + "\n")
        return 0
    }
    if (command === "help") {
        stream.write(usage() + "\n")
        return 0
    }

    const handler = COMMAND_TABLE.get(command)
    if (handler === undefined) {
        // A leading dash means the user gave an option where the subcommand
        // belongs; otherwise it's just an unrecognized command name.
        if (command.startsWith("-")) {
            console.error(`expected a subcommand: ${acceptedSubcommands()}`)
        } else {
            console.error(`unknown command: ${command} (expected: ${acceptedSubcommands()})`)
        }
        console.error(usage())
        return 1
    }

    // Library throws (missing tsconfig, unknown report name) become a clean
    // non-zero status rather than an unhandled rejection.
    try {
        return await handler(args.slice(i), common, stream)
    } catch (e) {
        console.error(e instanceof Error ? e.message : String(e))
        return 1
    }
}

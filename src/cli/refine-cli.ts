// refineCLI is the whole CLI as a function: consume the leading global options
// up to the subcommand, then hand the remaining tokens to the matching command
// handler in COMMAND_TABLE. Each handler parses its own options (calling
// parseCommonArgs for any trailing globals), opens the project, and runs.
// refineCLI writes stdout-bound output stream and resolves with 0 on
// success; on failure it rejects with an Error for the caller to display and
// turn into a non-zero exit. It never calls process.exit.
//
// Per-command progress and diagnostics go to `ctx.log` (the entry point wires
// it to stderr); the library never writes to the console itself.

import type {CLI} from "./cli-io.ts"
import {formatCLI} from "./format/format-cli.ts"
import {importsCLI} from "./imports/imports-cli.ts"
import {inspectCLI} from "./inspect/inspect-cli.ts"
import {listCLI} from "./list/list-cli.ts"
import {moveCLI} from "./move/move-cli.ts"
import {parseCommonArgs} from "./parse-common-args.ts"
import {renameCLI} from "./rename/rename-cli.ts"
import {reportCLI} from "./report/report-cli.ts"
import {usage} from "./usage.ts"

// The command table is the single source of truth for the set of subcommands:
// membership here is what makes a name valid. Insertion order also drives the
// accepted-subcommand error message.
const COMMAND_TABLE = new Map<string, CLI>([
    ["list", listCLI],
    ["inspect", inspectCLI],
    ["move", moveCLI],
    ["rename", renameCLI],
    ["imports", importsCLI],
    ["report", reportCLI],
    ["format", formatCLI],
])

function acceptedSubcommands(): string {
    return [...COMMAND_TABLE.keys(), "help"].join(", ")
}

export const refineCLI: CLI = async (ctx) => {
    const {args: common, tokens, output} = ctx

    // Consume the leading globals (including -h/--help); the first token that
    // isn't one is the subcommand, and the tokens to its right go to that
    // command's handler.
    let i = 0
    let command: string | undefined
    while (i < tokens.length) {
        const consumed = parseCommonArgs(common, tokens, i)
        if (consumed === 0) {
            command = tokens[i]
            i++
            break
        }
        i += consumed
    }

    // The `help` command, a no-argument invocation, and --help with no
    // subcommand all print usage. Globals without a subcommand fall through to
    // "expected a subcommand"; a subcommand combined with --help is left to the
    // handler, which currently throws to reject it.
    if (command === "help" || tokens.length === 0 || (command === undefined && common.help)) {
        output.write(usage() + "\n")
        return 0
    }

    const handler = command === undefined ? undefined : COMMAND_TABLE.get(command)
    if (!handler) {
        // Only globals and no subcommand reads as "expected a subcommand";
        // anything else — including a leading-dash token — is named back as an
        // unknown command so the offending token is visible.
        if (!command) {
            throw new Error(`expected a subcommand: ${acceptedSubcommands()}`)
        } else {
            throw new Error(`unknown command: ${command} (expected: ${acceptedSubcommands()})`)
        }
    }

    // A throw here propagates to the caller, which displays it.
    return await handler({...ctx, tokens: tokens.slice(i)})
}

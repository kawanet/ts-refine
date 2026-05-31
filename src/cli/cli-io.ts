// CLI I/O plumbing: the Context box every command runner receives, and the
// NULL_SINK the write commands route the report Markdown they don't print into.

import type {TSR} from "ts-refine"
import type {CommonArgs} from "./parse-common-args.ts"

// The single box refineCLI hands to each command: the parsed global args, the
// command's own remaining tokens, the stdout-bound stream, and the log sink for
// progress/diagnostics. refineCLI itself takes the same shape with the full
// token list and an empty `args` to fill.
export interface Context {
    args: CommonArgs
    tokens: string[]
    stream: TSR.Writer
    log: TSR.Writer
}

// Swallows the Markdown stream in the write modes; the runner consumes it.
export const NULL_SINK: TSR.Writer = {write: () => {}}

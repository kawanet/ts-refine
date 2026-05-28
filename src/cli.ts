#!/usr/bin/env node

// Parses argv, builds a ts-morph Project via initProject(), then dispatches
// to the action and report functions exported by ./index.ts in a fixed
// order (not input order):
//   1. --organize-imports
//   2. --remove-semicolons / --insert-semicolons
// Placing semicolons after organize-imports lets combined runs converge on
// the same final shape regardless of how flags were written.

import {initProject, runOrganizeImports, runReports, runSemicolons} from "./index.ts"
import {parseArgs} from "./lib/parse-args.ts"
import {usage} from "./lib/usage.ts"

const opts = await parseArgs(process.argv.slice(2))

// parseArgs encodes its outcome in the return value instead of exiting:
//   - undefined        — error path; a specific message has already been
//                        written to stderr. Append usage and exit 1.
//   - {help: true}     — --help / -h. Usage to stdout and exit 0.
//   - ParsedArgs       — normal dispatch.
if (opts === undefined) {
    console.error(usage())
    process.exit(1)
}
if ("help" in opts) {
    console.log(usage())
    process.exit(0)
}

const project = initProject(opts.tsconfigPath)

const fileOpts = {absIncludes: opts.absIncludes, absExcludes: opts.absExcludes}

// Library-side throws (e.g. unknown report name from runReports) are
// surfaced as a clean CLI error rather than an unhandled-rejection stack.
try {
    if (opts.organizeImports) {
        await runOrganizeImports(project, {...fileOpts, dryRun: opts.dryRun})
    }
    if (opts.removeSemicolons || opts.insertSemicolons) {
        const mode: "remove" | "insert" = opts.removeSemicolons ? "remove" : "insert"
        await runSemicolons(project, {...fileOpts, dryRun: opts.dryRun, mode})
    }
    if (opts.reportNames.length > 0) {
        await runReports(project, {...fileOpts, reportNames: opts.reportNames, stream: process.stdout})
    }
} catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
}

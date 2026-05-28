#!/usr/bin/env node

// Parses argv, builds a ts-morph Project via initProject(), then dispatches
// to the action and report functions exported by ./index.ts in a fixed
// order (not input order):
//   1. --organize-imports
//   2. --indent <N>
//   3. --semicolons on|off
// Organize-imports first reorders the structure; indent rewrites the
// leading whitespace once that structure is final; the semicolons pass
// only touches trailing characters and stays last.

import {selectFormat} from "./format/run-format.ts"
import {initProject, runIndent, runOrganizeImports, runReports, runSemicolons} from "./index.ts"
import {writePrettierMarkdown} from "./lib/format-prettier.ts"
import {writeTsSurveyMarkdown} from "./lib/format-ts-survey.ts"
import {parseArgs} from "./lib/parse-args.ts"
import {usage} from "./lib/usage.ts"

const opts = parseArgs(process.argv.slice(2))

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

const fileOpts = {absIncludes: opts.absIncludes, absExcludes: opts.absExcludes}

// Library-side throws (missing tsconfig from initProject, unknown report
// name from runReports, ...) surface as a clean CLI error rather than as
// an unhandled-rejection stack.
try {
    const project = initProject(opts.tsconfigPath)

    if (opts.organizeImports) {
        await runOrganizeImports(project, {...fileOpts, dryRun: opts.dryRun})
    }
    if (opts.indentWidth !== null) {
        await runIndent(project, {...fileOpts, dryRun: opts.dryRun, width: opts.indentWidth})
    }
    if (opts.semicolons !== null) {
        await runSemicolons(project, {...fileOpts, dryRun: opts.dryRun, semicolons: opts.semicolons})
    }
    // When no action was specified, parseArgs fills reportNames with every
    // registered report (the survey default), so this call is a no-op only
    // when the user picked actions explicitly. selectFormat owns the
    // per-format stream swap and post-processing, so cli.ts no longer
    // hard-codes any specific format name.
    const format = selectFormat(opts.format, process.stdout)
    const report = await runReports(project, {...fileOpts, reportNames: opts.reportNames, stream: format.reportStream})
    // Survey-default mode appends two recommendation blocks under the
    // per-report tables: `## recommendation` (the runnable ts-survey
    // command) followed by `### .prettierrc` (the JSON form). Skipping
    // these for the other paths is intentional — `--report` callers
    // asked for specific sections, and `--format` already suppresses
    // the Markdown body entirely.
    if (opts.surveyDefault) {
        writeTsSurveyMarkdown(report, process.stdout)
        writePrettierMarkdown(report, process.stdout)
    }
    format.finalize(report)
} catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
}

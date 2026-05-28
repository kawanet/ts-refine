/**
 * https://github.com/kawanet/ts-survey
 */

import type {Project} from "ts-morph";

export {}; // external module indicator

// Internal sink contract used by report writers. Consumers never construct
// or name this directly; they pass `process.stdout` or any object with a
// `write(line)` method as `RunReportsOpts.stream`.
type Writer = {write: (line: string) => void}

// Common base for every entry. Not exported — consumers reach the fields
// through the leaf Opts interfaces below.
interface TsSurveyOpts {
    absIncludes: string[]
    absExcludes: string[]
}

export interface RunOrganizeImportsOpts extends TsSurveyOpts {
    dryRun: boolean
}

export interface RunSemicolonsOpts extends RunOrganizeImportsOpts {
    semicolons: "on" | "off"
}

export interface RunIndentOpts extends RunOrganizeImportsOpts {
    width: number
}

// `runMemberSeparators` isn't implemented yet; the Opts interface exists
// so the matching report can return its recommendation in the same
// Partial<RunXxxOpts> shape every other report uses, and so the
// formatters (`--format prettier`, `--format ts-survey`) can already
// translate the recommendation into output.
export interface RunMemberSeparatorsOpts extends RunOrganizeImportsOpts {
    separator: "semi" | "comma" | "none"
}

// `runNewLine` action isn't implemented yet — same arrangement as
// RunMemberSeparatorsOpts: the report returns this shape so the
// formatters can already render `--new-line <value>` and `endOfLine`.
export interface RunNewLineOpts extends RunOrganizeImportsOpts {
    newLine: "lf" | "crlf" | "cr"
}

// `runBracketSpacing` action isn't implemented yet. The report returns
// the Partial so the formatters can render `--bracket-spacing on|off`
// and Prettier's `bracketSpacing`.
export interface RunBracketSpacingOpts extends RunOrganizeImportsOpts {
    bracketSpacing: "on" | "off"
}

export interface RunReportsOpts extends TsSurveyOpts {
    stream: Writer
    reportNames: string[]
}

// Recommendations collected by runReports, keyed by the report that
// produced them. Each value is the partial of the matching action's
// Opts that the report would suggest applying; missing keys mean the
// report didn't run or had nothing to recommend.
export interface TsSurveyReport {
    semicolons?: Partial<RunSemicolonsOpts>
    indent?: Partial<RunIndentOpts>
    memberSeparators?: Partial<RunMemberSeparatorsOpts>
    newLine?: Partial<RunNewLineOpts>
    bracketSpacing?: Partial<RunBracketSpacingOpts>
}

export declare function initProject(tsconfigPath: string): Project

export declare function runOrganizeImports(project: Project, opts: RunOrganizeImportsOpts): Promise<void>

export declare function runSemicolons(project: Project, opts: RunSemicolonsOpts): Promise<void>

export declare function runIndent(project: Project, opts: RunIndentOpts): Promise<void>

export declare function runReports(project: Project, opts: RunReportsOpts): Promise<TsSurveyReport>

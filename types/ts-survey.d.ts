/**
 * https://github.com/kawanet/ts-survey
 */

import type {Project} from "ts-morph";

export {}; // external module indicator

// Common base for every entry. Leaf Opts interfaces inherit it.
// paths holds the positional file arguments (absolute); empty means
// the whole project.
interface TsSurveyOpts {
    paths: string[]
}

// Recommendation shapes. Not runtime inputs — they describe the value
// type of each `TsSurveyReport` slot.

export interface RunSemicolonsOpts {
    semicolons: "on" | "off"
}

// "tab" recommends tab indentation (LS convertTabsToSpaces:false /
// Prettier useTabs); a number recommends that many spaces.
export interface RunIndentOpts {
    width: number | "tab"
}

export interface RunMemberSeparatorsOpts {
    separator: "semi" | "comma" | "none"
}

export interface RunNewLineOpts {
    newLine: "lf" | "crlf" | "cr"
}

export interface RunBracketSpacingOpts {
    bracketSpacing: "on" | "off"
}

// Every report runReports knows about. Pair with src/report/report-names.ts
// (runtime list) and src/report/run-reports.ts (dispatch).
export type TsSurveyReportName =
    | "unused-exports"
    | "semicolons"
    | "indent"
    | "member-separators"
    | "new-line"
    | "bracket-spacing"

export interface RunReportsOpts extends TsSurveyOpts {
    stream: {write: (line: string) => void}
    reportNames: TsSurveyReportName[]
}

// Per-report recommendations. A missing key means the report didn't run
// or had nothing to recommend.
export interface TsSurveyReport {
    semicolons?: Partial<RunSemicolonsOpts>
    indent?: Partial<RunIndentOpts>
    memberSeparators?: Partial<RunMemberSeparatorsOpts>
    newLine?: Partial<RunNewLineOpts>
    bracketSpacing?: Partial<RunBracketSpacingOpts>
}

// Input to `runReformat`. `report` provides defaults; the top-level
// overrides win per field. `organizeImports` defaults to "on".
export interface RunReformatOpts extends TsSurveyOpts {
    dryRun: boolean
    report: TsSurveyReport
    organizeImports?: "on" | "off"
    indent?: number | "tab"
    semicolons?: "on" | "off"
    // LS `newLineCharacter` only accepts \n / \r\n; a `cr` recommendation
    // is logged but not applied.
    newLine?: "lf" | "crlf"
    bracketSpacing?: "on" | "off"
}

// One row of `ls` output: per-file export / usage counts. runLs returns
// the full set (unfiltered) so later commands can reuse the snapshot; the
// CLI applies the --no-exports / --no-importers / --unused-exports filters.
export interface LsEntry {
    file: string
    exports: number
    unused: number
    importers: number
}

export interface RunLsOpts extends TsSurveyOpts {}

export declare function initProject(tsconfigPath: string): Project

export declare function runReports(project: Project, opts: RunReportsOpts): Promise<TsSurveyReport>

export declare function runReformat(project: Project, opts: RunReformatOpts): Promise<void>

export declare function runLs(project: Project, opts: RunLsOpts): Promise<LsEntry[]>

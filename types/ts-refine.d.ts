/**
 * https://github.com/kawanet/ts-refine
 */

import type {Project} from "ts-morph"

export {} // external module indicator

export declare namespace TSR {
    // Common base for every entry. Leaf Opts interfaces inherit it.
    // paths holds the positional file arguments (absolute); empty means
    // the whole project.
    interface CommonOpts {
        paths: string[]
    }

    // Recommendation shapes. Not runtime inputs — they describe the value
    // type of each `ReportResult` slot.

    interface SemicolonsOpts {
        semicolons: "on" | "off"
    }

    // "tab" recommends tab indentation (LS convertTabsToSpaces:false /
    // Prettier useTabs); a number recommends that many spaces.
    interface IndentOpts {
        width: number | "tab"
    }

    interface MemberSeparatorsOpts {
        separator: "semi" | "comma" | "none"
    }

    interface NewLineOpts {
        newLine: "lf" | "crlf" | "cr"
    }

    interface BracketSpacingOpts {
        bracketSpacing: "on" | "off"
    }

    // Every report refineReport knows about. Pair with src/report/report-names.ts
    // (runtime list) and src/report/refine-report.ts (dispatch).
    type ReportName = "semicolons" | "indent" | "member-separators" | "new-line" | "bracket-spacing"

    interface ReportOpts extends CommonOpts {
        stream: {write: (line: string) => void}
        reportNames: ReportName[]
    }

    // Per-report recommendations. A missing key means the report didn't run
    // or had nothing to recommend.
    interface ReportResult {
        semicolons?: Partial<SemicolonsOpts>
        indent?: Partial<IndentOpts>
        memberSeparators?: Partial<MemberSeparatorsOpts>
        newLine?: Partial<NewLineOpts>
        bracketSpacing?: Partial<BracketSpacingOpts>
    }

    // Input to `refineFormat`. `report` provides defaults; the top-level
    // overrides win per field. `organizeImports` defaults to "on".
    interface FormatOpts extends CommonOpts {
        dryRun: boolean
        report: ReportResult
        organizeImports?: "on" | "off"
        indent?: number | "tab"
        semicolons?: "on" | "off"
        // LS `newLineCharacter` only accepts \n / \r\n; a `cr` recommendation
        // is logged but not applied.
        newLine?: "lf" | "crlf"
        bracketSpacing?: "on" | "off"
    }

    // One row of `list` output: per-file export / usage counts. refineList returns
    // the full set (unfiltered) so later commands can reuse the snapshot; the
    // CLI applies the --no-exports / --no-importers / --unused-exports filters.
    interface ListEntry {
        file: string
        exports: number
        unused: number
        importers: number
    }

    interface ListOpts extends CommonOpts {}

    // Per-file inspect output. Each requested inspector populates its slot
    // (a missing key means the inspector did not run for this file).
    interface InspectFile {
        file: string
        exports?: InspectExport[]
        importers?: InspectImporter[]
    }

    // One exported declaration. `example` is the alphabetically first
    // importer file path, or null when no external file uses this export
    // (rendered as **unused** in the Markdown table).
    interface InspectExport {
        line: number
        kind: string
        name: string
        importers: number
        example: string | null
    }

    // One importer of the inspected file (collapsed to a single row even when
    // the importer has several import statements). `kinds` covers the import
    // forms used: value | type | namespace | dynamic | side-effect | re-export.
    // `names` lists the imported symbol names, with display tokens for forms
    // that don't carry names (`* as A`, `(dynamic)`, `(side effect)`).
    interface InspectImporter {
        file: string
        kinds: string[]
        names: string[]
    }

    // Every inspector refineInspect knows about. Pair with src/inspect/inspector-names.ts
    // (runtime list) and src/inspect/refine-inspect.ts (dispatch).
    export type InspectorName = "exports" | "importers"

    interface InspectOpts extends CommonOpts {
        inspectorNames: InspectorName[]
    }

    // Input to `refineMove`. `sources` are absolute paths of existing project
    // source files; `dest` is either an existing directory (multi-source) or
    // a destination file path (single-source rename). After moving, imports of
    // the files whose specifiers changed are re-sorted (organizeImports) using
    // `report` — the project-wide surveyed style — so they converge on it.
    interface MoveOpts {
        sources: string[]
        dest: string
        dryRun: boolean
        report: ReportResult
    }

    // refineMove returns the planned moves (from → to) and the set of in-project
    // files whose contents were rewritten (importers of the moved files plus
    // the moved files themselves), so callers can show a dry-run summary or
    // follow up with their own post-processing.
    interface MoveResult {
        moves: {from: string; to: string}[]
        touched: string[]
    }

    // Input to `refineRename`. Renames the exported identifier `from` to `to`
    // across the project. `file` (absolute path) restricts the lookup to that
    // file's exports; null means the symbol must be uniquely exported project
    // -wide. Named exports only — default/expression exports are out of scope.
    // After renaming, the touched files' imports are re-sorted (organizeImports)
    // using `report` — the project-wide surveyed style.
    interface RenameOpts {
        from: string
        to: string
        file: string | null
        dryRun: boolean
        report: ReportResult
    }

    // refineRename returns the applied rename and the in-project files whose text
    // was rewritten (declaration, importers, usages).
    interface RenameResult {
        from: string
        to: string
        touched: string[]
    }
}

export declare function initProject(opts: {tsConfigFilePath: string}): Project

export declare function refineReport(project: Project, opts: TSR.ReportOpts): Promise<TSR.ReportResult>

export declare function refineFormat(project: Project, opts: TSR.FormatOpts): Promise<void>

export declare function refineList(project: Project, opts: TSR.ListOpts): Promise<TSR.ListEntry[]>

export declare function refineInspect(project: Project, opts: TSR.InspectOpts): Promise<TSR.InspectFile[]>

export declare function refineMove(project: Project, opts: TSR.MoveOpts): Promise<TSR.MoveResult>

export declare function refineRename(project: Project, opts: TSR.RenameOpts): Promise<TSR.RenameResult>

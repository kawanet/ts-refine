/**
 * https://github.com/kawanet/ts-refine
 */

import type {Project} from "ts-morph"

export {} // external module indicator

export declare namespace TSR {
    // A minimal output sink: anything with a line-oriented write. The report
    // stream, the CLI's stdout, the diagnostics log, and NULL_SINK all satisfy it.
    type Writer = {write: (line: string) => void}

    // Common base for every entry. Supply the ts-morph project one of two ways:
    // your own `project` (bring-your-own — in-memory, custom options, and reuse
    // across calls), or a `tsConfigFilePath` to build a fresh one (best for
    // one-shot use). Exactly one is required — supplying both throws.
    // log receives progress/notes (route it to stderr); no-op Writer to discard.
    interface CommonOpts {
        project?: Project
        tsConfigFilePath?: string

        // Progress sink. Omit it to send progress lines to console.warn instead
        // (see the `logging` helper); pass a no-op Writer to silence them.
        log?: Writer
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
        paths: string[]

        // Markdown sink for the per-report tables. Omit it to compute the
        // recommendations only (callers that just want the ReportResult).
        output?: Writer
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

    // Per-field format intent derived from a report recommendation, and what the
    // CLI overrides feed. `newLine` is lf|crlf only — a `cr` recommendation is
    // neither a runnable flag nor an LS setting, so it never enters here.
    // refineMove/refineRename take this to organize the imports they rewrote.
    interface FormatStyle {
        indent?: number | "tab"
        semicolons?: "on" | "off"
        newLine?: "lf" | "crlf"
        bracketSpacing?: "on" | "off"

        // Interface / class member separators. Applied by a self-pass (the LS
        // can't set these and can't emit `comma` at all); no LS/Prettier mapping.
        memberSeparators?: "semi" | "comma" | "none"
    }

    // Input to `refineFormat`: the style to apply (survey recommendation + CLI
    // overrides). Reformats the surrounding text only; organizing imports is the
    // separate `imports` command. `format` is one style applied to the whole run.
    interface FormatOpts extends CommonOpts {
        paths: string[]
        dryRun: boolean
        format: FormatStyle
    }

    // refineFormat returns the in-project files whose text was rewritten, so a
    // caller can report a dry-run summary or decide an exit status without
    // re-reading the files.
    interface FormatResult {
        touched: string[]
    }

    // Input to `refineImports`: organize each file's import/export block (sort,
    // merge, drop unused, settle type-only markers) without reformatting the
    // surrounding text. Each file is surveyed on its own (import/export tallies)
    // and organized in that style, so the project's existing style barely shifts.
    interface ImportsOpts extends CommonOpts {
        paths: string[]
        dryRun: boolean
    }

    // refineImports returns the in-project files whose import block was rewritten,
    // mirroring FormatResult so callers handle a dry-run summary the same way.
    interface ImportsResult {
        touched: string[]
    }

    // One row of `list` output: per-file export / usage counts. refineList
    // builds the per-file snapshot and applies the requested ListFilters
    // (if any) before returning.
    interface ListEntry {
        file: string
        exports: number
        unused: number
        importers: number
    }

    // `list` cleanup-candidate filters; all optional. Several active filters
    // narrow the result together (AND): an entry is kept only when it matches
    // every filter that is set. `ref` keeps only files that reference the given
    // target (same dotted-name forms as rename's --from: plain, ns.member,
    // Type.prop, ns.Type.prop).
    interface ListFilters {
        noExports?: boolean
        noImporters?: boolean
        unusedExports?: boolean
        ref?: string
    }

    interface ListOpts extends CommonOpts {
        paths?: string[]
        filters?: ListFilters
    }

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
    type InspectorName = "exports" | "importers"

    interface InspectOpts extends CommonOpts {
        paths: string[]
        inspectorNames: InspectorName[]
    }

    // Input to `refineMove`. `sources` are absolute paths of existing project
    // source files; `dest` is an existing directory (multi-source) or a
    // destination file path (single-source rename). After moving, each changed
    // file's import block is re-sorted in that file's own surveyed style,
    // sampled from its pre-move state.
    interface MoveOpts extends CommonOpts {
        sources: string[]
        dest: string
        dryRun: boolean
    }

    // refineMove returns the planned moves (from → to) and the set of in-project
    // files whose contents were rewritten (importers of the moved files plus
    // the moved files themselves), so callers can show a dry-run summary or
    // follow up with their own post-processing.
    interface MoveResult {
        moves: {from: string; to: string}[]
        touched: string[]
    }

    // Input to `refineRename`. Renames `from` to `to` in place; a dotted spec
    // (ns.member, Type.prop, ns.Type.prop) renames a member of a matching
    // container. `file` scopes the lookup; null requires a project-unique symbol.
    // Each touched file's import block is re-sorted in that file's own surveyed
    // style.
    interface RenameOpts extends CommonOpts {
        from: string
        to: string
        file: string | null
        dryRun: boolean
    }

    // refineRename returns the applied rename and the in-project files whose text
    // was rewritten (declaration, importers, usages).
    interface RenameResult {
        from: string
        to: string
        touched: string[]
    }
}

export declare function refineReport(opts: TSR.ReportOpts): Promise<TSR.ReportResult>

export declare function refineFormat(opts: TSR.FormatOpts): Promise<TSR.FormatResult>

export declare function refineImports(opts: TSR.ImportsOpts): Promise<TSR.ImportsResult>

export declare function refineList(opts: TSR.ListOpts): Promise<TSR.ListEntry[]>

export declare function refineInspect(opts: TSR.InspectOpts): Promise<TSR.InspectFile[]>

export declare function refineMove(opts: TSR.MoveOpts): Promise<TSR.MoveResult>

export declare function refineRename(opts: TSR.RenameOpts): Promise<TSR.RenameResult>

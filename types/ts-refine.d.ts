/**
 * https://github.com/kawanet/ts-refine
 */

export {} // external module indicator

export declare namespace TSR {
    // output stream
    type Writer = {write: (line: string) => void}

    // Provisional structural surface of a bring-your-own project. Intentionally
    // not exhaustive: it covers the methods the library's own (non-bridge) tests
    // exercise, so a caller can hand in a compatible project without the package
    // exposing its internal compat layer. The in-package Project/SourceFile
    // classes implement these, which keeps the two in sync.
    interface SourceFile {
        getFullText(): string
    }

    interface Project {
        createSourceFile(filePath: string, text: string, options?: {overwrite?: boolean}): SourceFile
        addSourceFileAtPath(filePath: string): SourceFile
        getSourceFile(filePath: string): SourceFile | undefined
        getSourceFiles(): SourceFile[]
    }

    // Options for createRefineProject. Intentionally small: load from a tsconfig
    // (the common case), or start an in-memory project and add files yourself.
    // `skipLoadingLibFiles` is deliberately not exposed — the refine entries do
    // semantic work that needs the default library; a caller that truly wants it
    // can pass `compilerOptions: {noLib: true}`.
    interface ProjectOptions {
        tsConfigFilePath?: string
        useInMemoryFileSystem?: boolean
        compilerOptions?: import("typescript").CompilerOptions
    }

    // Common base for every entry. Supply the project one of two ways: your own
    // `project` (bring-your-own — in-memory, custom options, and reuse across
    // calls), or a `tsConfigFilePath` to build a fresh one (best for one-shot
    // use). Exactly one is required — supplying both throws.
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

    // One rendered block of a report: a heading and a Markdown table held as
    // raw cells (table[0] is the header row; "" is a blank cell). The CLI turns
    // these into Markdown, so the library stays output-format agnostic and a
    // future `--emit csv` / `--emit json` can consume the same data.
    interface Section {
        title?: string
        table?: string[][]
    }

    // Mixed into every per-report result so each carries its display sections.
    interface ReportSections {
        sections?: Section[]
    }

    interface SemiReport extends ReportSections {
        semi?: "on" | "off"
    }

    // "tab" recommends tab indentation (LS convertTabsToSpaces:false /
    // Prettier useTabs); a number recommends that many spaces.
    interface IndentReport extends ReportSections {
        width?: number | "tab"
    }

    interface MemberDelimiterReport extends ReportSections {
        delimiter?: "semi" | "comma" | "none"
    }

    interface NewLineReport extends ReportSections {
        newLine?: "lf" | "crlf"
    }

    interface BracketSpacingReport extends ReportSections {
        bracketSpacing?: "on" | "off"
    }

    interface TrailingCommaReport extends ReportSections {
        trailingComma?: "on" | "off"
    }

    interface FunctionSpacingReport extends ReportSections {
        // Space after anonymous `function` / `function*` before the parameter paren.
        functionKeywordSpacing?: "on" | "off"
        // Space before function/method parameter parens.
        functionParenSpacing?: "on" | "off"
        // Space after parenthesized control-flow keywords such as `if` or `catch`.
        controlKeywordSpacing?: "on" | "off"
    }

    // Every report refineReport supports.
    type ReportName = "semi" | "indent" | "member-delimiter" | "new-line" | "bracket-spacing" | "trailing-comma" | "function-spacing"

    interface ReportOpts extends CommonOpts {
        paths?: string[]
        reports?: ReportName[]
    }

    // Per-report recommendations. A missing key means the report didn't run
    // or had nothing to recommend.
    interface ReportResult {
        semi?: SemiReport
        indent?: IndentReport
        memberDelimiter?: MemberDelimiterReport
        newLine?: NewLineReport
        bracketSpacing?: BracketSpacingReport
        trailingComma?: TrailingCommaReport
        functionSpacing?: FunctionSpacingReport
    }

    // Per-field format intent derived from a report recommendation, and what the
    // CLI overrides feed. refineMove/refineRename take this to organize the
    // imports they rewrote.
    interface FormatStyle {
        indent?: number | "tab"
        semi?: "on" | "off"
        newLine?: "lf" | "crlf"
        bracketSpacing?: "on" | "off"
        // Space after anonymous `function` / `function*` before the parameter paren.
        functionKeywordSpacing?: "on" | "off"
        // Space before function/method parameter parens.
        functionParenSpacing?: "on" | "off"
        // Space after parenthesized control-flow keywords such as `if` or `catch`.
        controlKeywordSpacing?: "on" | "off"

        // Interface / class member delimiter. Applied by a self-pass (the LS
        // can't set these and can't emit `comma` at all); no LS/Prettier mapping.
        memberDelimiter?: "semi" | "comma" | "none"

        // Trailing comma on multi-line comma lists (arrays, objects, args, params,
        // tuples, enums, import/export specifiers). `on` adds it on multi-line and
        // strips it single-line; `off` strips it. A spread / rest last element is
        // left as written (adding one is a syntax error). Applied by a self-pass.
        trailingComma?: "on" | "off"
    }

    // Input to `refineFormat`: the style to apply (survey recommendation + CLI
    // overrides). Reformats the surrounding text only; organizing imports is the
    // separate `imports` command. `format` is one style applied to the whole run.
    interface FormatOpts extends CommonOpts {
        paths?: string[]
        dryRun?: boolean
        style: FormatStyle
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
        paths?: string[]
        dryRun?: boolean
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
        example?: string
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
        paths?: string[]
        inspectors?: InspectorName[]
    }

    // Input to `refineMove`. `sources` are absolute paths of existing project
    // source files; `dest` is an existing directory (multi-source) or a
    // destination file path (single-source rename). After moving, each changed
    // file's import block is re-sorted in that file's own surveyed style,
    // sampled from its pre-move state.
    interface MoveOpts extends CommonOpts {
        sources: string[]
        dest: string
        dryRun?: boolean
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
        file?: string
        dryRun?: boolean
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

// Build a project to pass as `project` to the refine entries — construct it once
// and reuse it across calls instead of rebuilding per call.
export declare function createRefineProject(options?: TSR.ProjectOptions): TSR.Project

import type {FormatCodeSettings, SourceFile} from "ts-morph"
import {ts} from "ts-morph"
import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../common/format-style.ts"
import {importReportNames} from "../common/report-names.ts"
import {runReports} from "../report/refine-report.ts"

// Per-file import style: the LS settings organizeImports consumes, plus the
// trailing-comma axis it can't express (a self-pass reasserts it afterward).
export interface ImportsStyle {
    settings: FormatCodeSettings
    trailingComma?: "on" | "off"
}

// Survey a single file's import/export statements and convert the recommended
// style to ts-morph settings. The write commands call this per file so each
// keeps its own existing conventions.
export const formatSettingsForFile = async (sf: SourceFile): Promise<ImportsStyle> => {
    const log = {write: (): void => undefined}
    const report = await runReports({sourceFiles: [sf], importsOnly: true, log}, importReportNames)
    const style = reportToFormatStyle(report)
    return {settings: formatStyleToSettings(style), trailingComma: style.trailingComma}
}

// FormatCodeSettings is readonly; build mutably and cast at the return.
type MutableFormatSettings = {-readonly [K in keyof FormatCodeSettings]: FormatCodeSettings[K]}

// FormatStyle → the FormatCodeSettings refineFormat hands to ts-morph. The
// chosen newline lands in `newLineCharacter`; callers that need to normalize
// existing terminators read it back from there (see refineFormat).
export function formatStyleToSettings(options: TSR.FormatStyle): FormatCodeSettings {
    const settings: MutableFormatSettings = {}

    // "tab" turns convertTabsToSpaces off (LS then indents with tabs);
    // a number pins space indentation at that width.
    if (options.indent === "tab") {
        settings.convertTabsToSpaces = false
    } else if (typeof options.indent === "number") {
        settings.indentSize = options.indent
        settings.tabSize = options.indent
        settings.convertTabsToSpaces = true
    }

    if (options.semi === "on") {
        settings.semicolons = ts.SemicolonPreference.Insert
    } else if (options.semi === "off") {
        settings.semicolons = ts.SemicolonPreference.Remove
    }

    // Empty braces stay tight (`{}`) regardless of bracketSpacing, matching
    // Prettier, which never emits `{ }`. The LS default would otherwise space
    // them whenever the non-empty axis is on or unset, turning a bare
    // `export {}` into `export { }`.
    settings.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces = false

    if (options.bracketSpacing === "on") {
        settings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = true
    } else if (options.bracketSpacing === "off") {
        settings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = false
    }

    if (options.newLine === "lf") {
        settings.newLineCharacter = "\n"
    } else if (options.newLine === "crlf") {
        settings.newLineCharacter = "\r\n"
    }

    return settings
}

// Normalizes pre-existing terminators that the LS won't touch.
export function normalizeNewLines(text: string, target: "\n" | "\r\n"): string {
    // Collapse to LF first to avoid double-rewriting already-CRLF text.
    const normalized = text.replace(/\r\n|\r/g, "\n")
    return target === "\n" ? normalized : normalized.replace(/\n/g, "\r\n")
}

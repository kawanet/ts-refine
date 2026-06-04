import type {FormatCodeSettings, SourceFile} from "ts-morph"
import {ts} from "ts-morph"
import type {TSR} from "ts-refine"
import {reportToFormatStyle} from "../common/format-style.ts"
import {NULL_SINK} from "../common/logging.ts"
import {importReportNames} from "../common/report-names.ts"
import {runReports} from "../report/refine-report.ts"

// Survey a single file's import/export statements and convert the recommended
// style to ts-morph settings. The write commands call this per file so each
// keeps its own existing conventions.
export const formatSettingsForFile = async (sf: SourceFile): Promise<FormatCodeSettings> => {
    const report = await runReports({sourceFiles: [sf], importsOnly: true, log: NULL_SINK}, importReportNames)
    const style = reportToFormatStyle(report)
    return formatStyleToSettings(style)
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

    if (options.semicolons === "on") {
        settings.semicolons = ts.SemicolonPreference.Insert
    } else if (options.semicolons === "off") {
        settings.semicolons = ts.SemicolonPreference.Remove
    }

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

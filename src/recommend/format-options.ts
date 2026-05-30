// FormatOptions is the canonical per-field formatting intent. Both the
// report recommendation and the CLI overrides are funneled into it, so
// the ts-refine command output and the actual apply derive from one
// value — guaranteeing they agree. The pipeline is:
//   ReportResult ─reportToFormatOptions─┐
//                                          ├─ mergeFormatOptions ─ resolveSettings ─▶ ResolvedSettings
//   FormatOptions ─overridesToFormatOptions┘
// and buildFormatFlags renders the same FormatOptions back to argv.

import type {FormatCodeSettings} from "ts-morph"
import {ts} from "ts-morph"
import type {TSR} from "ts-refine"

// `newLine` is lf|crlf only: a `cr` recommendation is neither a runnable
// ts-refine flag nor an LS setting, so it never enters FormatOptions.
export interface FormatOptions {
    organizeImports?: "on" | "off"
    indent?: number | "tab"
    semicolons?: "on" | "off"
    newLine?: "lf" | "crlf"
    bracketSpacing?: "on" | "off"
}

// LS settings + refineFormat-only concerns (organize gate, newline post-pass).
// Local-ish shape — refineFormat reads it; the CR diagnostic is computed at
// the apply entry from the report, not carried here.
export interface ResolvedSettings {
    formatSettings: FormatCodeSettings
    organizeImports: boolean
    newLineNormalize: "\n" | "\r\n" | undefined
}

// FormatCodeSettings is readonly; build mutably and cast at the return.
type MutableFormatSettings = {-readonly [K in keyof FormatCodeSettings]: FormatCodeSettings[K]}

// Recommendation → options. `cr` is read and discarded (see FormatOptions);
// member-separators has no actionable mapping and is dropped too.
export function reportToFormatOptions(report: TSR.ReportResult): FormatOptions {
    const options: FormatOptions = {}
    if (report.semicolons?.semicolons) options.semicolons = report.semicolons.semicolons
    if (report.indent?.width !== undefined) options.indent = report.indent.width
    const newLine = report.newLine?.newLine
    if (newLine === "lf" || newLine === "crlf") options.newLine = newLine
    if (report.bracketSpacing?.bracketSpacing) options.bracketSpacing = report.bracketSpacing.bracketSpacing
    return options
}

// CLI overrides → options. A typed seam keeping parseArgs decoupled from
// the FormatOptions vocabulary; the shapes happen to line up today.
export function overridesToFormatOptions(overrides: FormatOptions): FormatOptions {
    return {
        organizeImports: overrides.organizeImports,
        indent: overrides.indent,
        semicolons: overrides.semicolons,
        newLine: overrides.newLine,
        bracketSpacing: overrides.bracketSpacing,
    }
}

// Per-field precedence: override wins over base, else base, else unset.
export function mergeFormatOptions(base: FormatOptions, override: FormatOptions): FormatOptions {
    return {
        organizeImports: override.organizeImports ?? base.organizeImports,
        indent: override.indent ?? base.indent,
        semicolons: override.semicolons ?? base.semicolons,
        newLine: override.newLine ?? base.newLine,
        bracketSpacing: override.bracketSpacing ?? base.bracketSpacing,
    }
}

// FormatOptions → the settings refineFormat hands to ts-morph.
export function resolveSettings(options: FormatOptions): ResolvedSettings {
    const formatSettings: MutableFormatSettings = {}

    // "tab" turns convertTabsToSpaces off (LS then indents with tabs);
    // a number pins space indentation at that width.
    if (options.indent === "tab") {
        formatSettings.convertTabsToSpaces = false
    } else if (typeof options.indent === "number") {
        formatSettings.indentSize = options.indent
        formatSettings.tabSize = options.indent
        formatSettings.convertTabsToSpaces = true
    }

    if (options.semicolons === "on") {
        formatSettings.semicolons = ts.SemicolonPreference.Insert
    } else if (options.semicolons === "off") {
        formatSettings.semicolons = ts.SemicolonPreference.Remove
    }

    if (options.bracketSpacing === "on") {
        formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = true
    } else if (options.bracketSpacing === "off") {
        formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = false
    }

    let newLineNormalize: "\n" | "\r\n" | undefined
    if (options.newLine === "lf") {
        formatSettings.newLineCharacter = "\n"
        newLineNormalize = "\n"
    } else if (options.newLine === "crlf") {
        formatSettings.newLineCharacter = "\r\n"
        newLineNormalize = "\r\n"
    }

    const organizeImports = options.organizeImports !== "off"

    return {formatSettings, organizeImports, newLineNormalize}
}

// Normalizes pre-existing terminators that the LS won't touch.
export function normalizeNewLines(text: string, target: "\n" | "\r\n"): string {
    // Collapse to LF first to avoid double-rewriting already-CRLF text.
    const normalized = text.replace(/\r\n|\r/g, "\n")
    return target === "\n" ? normalized : normalized.replace(/\n/g, "\r\n")
}

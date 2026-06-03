import type {FormatCodeSettings} from "ts-morph"
import {ts} from "ts-morph"
import type {TSR} from "ts-refine"

// LS settings + the newline post-pass refineFormat runs after formatText.
// Local-ish shape — refineFormat reads it; the CR diagnostic is computed at
// the apply entry from the report, not carried here. refineImports reuses the
// formatSettings field for its organize pass and ignores newLineNormalize.
interface FormatSettings {
    settings: FormatCodeSettings
    newLine: "\n" | "\r\n" | undefined
}

// A run's `format` is one style for everyone, or a per-file resolver. Returns a
// per-file accessor so callers loop uniformly: a static style is converted once
// here, a resolver is surveyed lazily inside the loop. Shared by refineFormat
// (per-file under `format`) and refineImports. Omitted `format` means the empty
// style, i.e. the TS language service defaults.
export function perFileSettings(format?: TSR.FormatStyle | ((file: string) => Promise<TSR.FormatStyle>)): (file: string) => Promise<FormatSettings> {
    if (typeof format === "function") return (file) => format(file).then(formatStyleToSettings)
    const settings = formatStyleToSettings(format ?? {})
    return () => Promise.resolve(settings)
}

// FormatCodeSettings is readonly; build mutably and cast at the return.
type MutableFormatSettings = {-readonly [K in keyof FormatCodeSettings]: FormatCodeSettings[K]}

// FormatStyle → the settings refineFormat hands to ts-morph.
export function formatStyleToSettings(options: TSR.FormatStyle): FormatSettings {
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

    let newLine: "\n" | "\r\n" | undefined
    if (options.newLine === "lf") {
        settings.newLineCharacter = "\n"
        newLine = "\n"
    } else if (options.newLine === "crlf") {
        settings.newLineCharacter = "\r\n"
        newLine = "\r\n"
    }

    return {settings, newLine}
}

// Normalizes pre-existing terminators that the LS won't touch.
export function normalizeNewLines(text: string, target: "\n" | "\r\n"): string {
    // Collapse to LF first to avoid double-rewriting already-CRLF text.
    const normalized = text.replace(/\r\n|\r/g, "\n")
    return target === "\n" ? normalized : normalized.replace(/\n/g, "\r\n")
}

// Pure helper: report + overrides → settings runApply consumes.
// Per-field precedence is override > recommendation > undefined.

import type {TsSurveyReport} from "@kawanet/ts-survey"
import type {FormatCodeSettings} from "ts-morph"
import {ts} from "ts-morph"

import type {ApplyOverrides} from "./parse-args.ts"

// LS settings + runApply-only concerns (organize gate, newline post-pass,
// CR diagnostic). Local to this module — runApply reads the shape only.
interface ResolvedSettings {
    formatSettings: FormatCodeSettings
    organizeImports: boolean
    newLineNormalize: "\n" | "\r\n" | undefined
    crRecommended: boolean
}

// FormatCodeSettings is readonly; build mutably and cast at the return.
type MutableFormatSettings = {-readonly [K in keyof FormatCodeSettings]: FormatCodeSettings[K]}

export function mergeRecommendations(report: TsSurveyReport, overrides: ApplyOverrides): ResolvedSettings {
    const formatSettings: MutableFormatSettings = {}

    // convertTabsToSpaces is pinned: the recommender speaks spaces only.
    const indent = overrides.indent ?? report.indent?.width
    if (typeof indent === "number") {
        formatSettings.indentSize = indent
        formatSettings.tabSize = indent
        formatSettings.convertTabsToSpaces = true
    }

    const semicolons = overrides.semicolons ?? report.semicolons?.semicolons
    if (semicolons === "on") {
        formatSettings.semicolons = ts.SemicolonPreference.Insert
    } else if (semicolons === "off") {
        formatSettings.semicolons = ts.SemicolonPreference.Remove
    }

    const bracketSpacing = overrides.bracketSpacing ?? report.bracketSpacing?.bracketSpacing
    if (bracketSpacing === "on") {
        formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = true
    } else if (bracketSpacing === "off") {
        formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = false
    }

    // `cr` recommendation surfaces via crRecommended; the LS cannot emit it.
    const reportedNewLine = report.newLine?.newLine
    const crRecommended = overrides.newLine === undefined && reportedNewLine === "cr"
    const effectiveNewLine = overrides.newLine ?? (reportedNewLine === "cr" ? undefined : reportedNewLine)
    let newLineNormalize: "\n" | "\r\n" | undefined
    if (effectiveNewLine === "lf") {
        formatSettings.newLineCharacter = "\n"
        newLineNormalize = "\n"
    } else if (effectiveNewLine === "crlf") {
        formatSettings.newLineCharacter = "\r\n"
        newLineNormalize = "\r\n"
    }

    const organizeImports = overrides.organizeImports !== "off"

    return {formatSettings, organizeImports, newLineNormalize, crRecommended}
}

// Normalizes pre-existing terminators that the LS won't touch.
export function normalizeNewLines(text: string, target: "\n" | "\r\n"): string {
    // Collapse to LF first to avoid double-rewriting already-CRLF text.
    const normalized = text.replace(/\r\n|\r/g, "\n")
    return target === "\n" ? normalized : normalized.replace(/\n/g, "\r\n")
}

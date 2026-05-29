import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"

import {mergeFormatOptions, normalizeNewLines, overridesToFormatOptions, reportToFormatOptions, resolveSettings} from "./format-options.ts"

describe("reportToFormatOptions", () => {
    it("maps the actionable report fields", () => {
        const o = reportToFormatOptions({
            semicolons: {semicolons: "on"},
            indent: {width: 4},
            newLine: {newLine: "crlf"},
            bracketSpacing: {bracketSpacing: "off"},
        })
        assert.deepEqual(o, {semicolons: "on", indent: 4, newLine: "crlf", bracketSpacing: "off"})
    })

    it("carries indent.width=tab through", () => {
        assert.equal(reportToFormatOptions({indent: {width: "tab"}}).indent, "tab")
    })

    it("discards a cr newline recommendation (not a runnable flag nor an LS setting)", () => {
        const o = reportToFormatOptions({newLine: {newLine: "cr"}})
        assert.equal(o.newLine, undefined)
    })

    it("ignores member-separators (no actionable mapping)", () => {
        const o = reportToFormatOptions({memberSeparators: {separator: "comma"}})
        assert.deepEqual(o, {})
    })
})

describe("overridesToFormatOptions", () => {
    it("copies the override fields into options", () => {
        const o = overridesToFormatOptions({indent: "tab", semicolons: "off", organizeImports: "off"})
        assert.equal(o.indent, "tab")
        assert.equal(o.semicolons, "off")
        assert.equal(o.organizeImports, "off")
    })
})

describe("mergeFormatOptions", () => {
    it("lets the override win per field, falling back to the base", () => {
        const merged = mergeFormatOptions({semicolons: "on", indent: 2}, {indent: 4})
        assert.equal(merged.semicolons, "on")
        assert.equal(merged.indent, 4)
    })

    it("leaves a field unset when neither side speaks", () => {
        assert.equal(mergeFormatOptions({}, {}).bracketSpacing, undefined)
    })
})

describe("resolveSettings", () => {
    it("maps a numeric indent to indentSize/tabSize + convertTabsToSpaces", () => {
        const r = resolveSettings({indent: 2})
        assert.equal(r.formatSettings.indentSize, 2)
        assert.equal(r.formatSettings.tabSize, 2)
        assert.equal(r.formatSettings.convertTabsToSpaces, true)
    })

    it("maps indent=tab → convertTabsToSpaces:false without indentSize", () => {
        const r = resolveSettings({indent: "tab"})
        assert.equal(r.formatSettings.convertTabsToSpaces, false)
        assert.equal(r.formatSettings.indentSize, undefined)
        assert.equal(r.formatSettings.tabSize, undefined)
    })

    it("leaves indent fields undefined when indent is unset", () => {
        const r = resolveSettings({})
        assert.equal(r.formatSettings.indentSize, undefined)
        assert.equal(r.formatSettings.convertTabsToSpaces, undefined)
    })

    it("maps semicolons on/off to the SemicolonPreference", () => {
        assert.equal(resolveSettings({semicolons: "on"}).formatSettings.semicolons, ts.SemicolonPreference.Insert)
        assert.equal(resolveSettings({semicolons: "off"}).formatSettings.semicolons, ts.SemicolonPreference.Remove)
    })

    it("maps bracketSpacing on/off to the brace-padding flag", () => {
        assert.equal(resolveSettings({bracketSpacing: "on"}).formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, true)
        assert.equal(resolveSettings({bracketSpacing: "off"}).formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, false)
    })

    it("maps newLine lf → \\n + normalize target", () => {
        const r = resolveSettings({newLine: "lf"})
        assert.equal(r.formatSettings.newLineCharacter, "\n")
        assert.equal(r.newLineNormalize, "\n")
    })

    it("maps newLine crlf → \\r\\n + normalize target", () => {
        const r = resolveSettings({newLine: "crlf"})
        assert.equal(r.formatSettings.newLineCharacter, "\r\n")
        assert.equal(r.newLineNormalize, "\r\n")
    })

    it("organizeImports defaults to true and is suppressed only by off", () => {
        assert.equal(resolveSettings({}).organizeImports, true)
        assert.equal(resolveSettings({organizeImports: "on"}).organizeImports, true)
        assert.equal(resolveSettings({organizeImports: "off"}).organizeImports, false)
    })
})

describe("normalizeNewLines", () => {
    it("converts mixed LF/CRLF/CR to LF when the target is LF", () => {
        const input = "a\nb\r\nc\rd\n"
        assert.equal(normalizeNewLines(input, "\n"), "a\nb\nc\nd\n")
    })

    it("converts mixed LF/CRLF/CR to CRLF when the target is CRLF", () => {
        const input = "a\nb\r\nc\rd\n"
        assert.equal(normalizeNewLines(input, "\r\n"), "a\r\nb\r\nc\r\nd\r\n")
    })

    it("is idempotent on already-LF input when target is LF", () => {
        assert.equal(normalizeNewLines("x\ny\n", "\n"), "x\ny\n")
    })

    it("is idempotent on already-CRLF input when target is CRLF (no \\r doubling)", () => {
        assert.equal(normalizeNewLines("x\r\ny\r\n", "\r\n"), "x\r\ny\r\n")
    })

    it("leaves non-terminator characters untouched", () => {
        assert.equal(normalizeNewLines("hello world", "\n"), "hello world")
    })
})

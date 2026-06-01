import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"
import {formatStyleToSettings, normalizeNewLines} from "./format-settings.ts"

describe("formatStyleToSettings", () => {
    it("maps a numeric indent to indentSize/tabSize + convertTabsToSpaces", () => {
        const r = formatStyleToSettings({indent: 2})
        assert.equal(r.formatSettings.indentSize, 2)
        assert.equal(r.formatSettings.tabSize, 2)
        assert.equal(r.formatSettings.convertTabsToSpaces, true)
    })

    it("maps indent=tab → convertTabsToSpaces:false without indentSize", () => {
        const r = formatStyleToSettings({indent: "tab"})
        assert.equal(r.formatSettings.convertTabsToSpaces, false)
        assert.equal(r.formatSettings.indentSize, undefined)
        assert.equal(r.formatSettings.tabSize, undefined)
    })

    it("leaves indent fields undefined when indent is unset", () => {
        const r = formatStyleToSettings({})
        assert.equal(r.formatSettings.indentSize, undefined)
        assert.equal(r.formatSettings.convertTabsToSpaces, undefined)
    })

    it("maps semicolons on/off to the SemicolonPreference", () => {
        assert.equal(formatStyleToSettings({semicolons: "on"}).formatSettings.semicolons, ts.SemicolonPreference.Insert)
        assert.equal(formatStyleToSettings({semicolons: "off"}).formatSettings.semicolons, ts.SemicolonPreference.Remove)
    })

    it("maps bracketSpacing on/off to the brace-padding flag", () => {
        assert.equal(formatStyleToSettings({bracketSpacing: "on"}).formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, true)
        assert.equal(formatStyleToSettings({bracketSpacing: "off"}).formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, false)
    })

    it("maps newLine lf → \\n + normalize target", () => {
        const r = formatStyleToSettings({newLine: "lf"})
        assert.equal(r.formatSettings.newLineCharacter, "\n")
        assert.equal(r.newLineNormalize, "\n")
    })

    it("maps newLine crlf → \\r\\n + normalize target", () => {
        const r = formatStyleToSettings({newLine: "crlf"})
        assert.equal(r.formatSettings.newLineCharacter, "\r\n")
        assert.equal(r.newLineNormalize, "\r\n")
    })

    it("organizeImports defaults to true and is suppressed only by off", () => {
        assert.equal(formatStyleToSettings({}).organizeImports, true)
        assert.equal(formatStyleToSettings({organizeImports: "on"}).organizeImports, true)
        assert.equal(formatStyleToSettings({organizeImports: "off"}).organizeImports, false)
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

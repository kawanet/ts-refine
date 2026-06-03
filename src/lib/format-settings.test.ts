import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"
import {formatStyleToSettings, normalizeNewLines} from "./format-settings.ts"

describe("formatStyleToSettings", () => {
    it("maps a numeric indent to indentSize/tabSize + convertTabsToSpaces", () => {
        const r = formatStyleToSettings({indent: 2})
        assert.equal(r.settings.indentSize, 2)
        assert.equal(r.settings.tabSize, 2)
        assert.equal(r.settings.convertTabsToSpaces, true)
    })

    it("maps indent=tab → convertTabsToSpaces:false without indentSize", () => {
        const r = formatStyleToSettings({indent: "tab"})
        assert.equal(r.settings.convertTabsToSpaces, false)
        assert.equal(r.settings.indentSize, undefined)
        assert.equal(r.settings.tabSize, undefined)
    })

    it("leaves indent fields undefined when indent is unset", () => {
        const r = formatStyleToSettings({})
        assert.equal(r.settings.indentSize, undefined)
        assert.equal(r.settings.convertTabsToSpaces, undefined)
    })

    it("maps semicolons on/off to the SemicolonPreference", () => {
        assert.equal(formatStyleToSettings({semicolons: "on"}).settings.semicolons, ts.SemicolonPreference.Insert)
        assert.equal(formatStyleToSettings({semicolons: "off"}).settings.semicolons, ts.SemicolonPreference.Remove)
    })

    it("maps bracketSpacing on/off to the brace-padding flag", () => {
        assert.equal(formatStyleToSettings({bracketSpacing: "on"}).settings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, true)
        assert.equal(formatStyleToSettings({bracketSpacing: "off"}).settings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, false)
    })

    it("maps newLine lf → \\n + normalize target", () => {
        const r = formatStyleToSettings({newLine: "lf"})
        assert.equal(r.settings.newLineCharacter, "\n")
        assert.equal(r.newLine, "\n")
    })

    it("maps newLine crlf → \\r\\n + normalize target", () => {
        const r = formatStyleToSettings({newLine: "crlf"})
        assert.equal(r.settings.newLineCharacter, "\r\n")
        assert.equal(r.newLine, "\r\n")
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

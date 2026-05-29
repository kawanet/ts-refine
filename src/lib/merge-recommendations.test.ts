import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"

import {mergeRecommendations, normalizeNewLines} from "./merge-recommendations.ts"

describe("mergeRecommendations", () => {
    it("uses report.indent.width when no override is given", () => {
        const r = mergeRecommendations({indent: {width: 2}}, {})
        assert.equal(r.formatSettings.indentSize, 2)
        assert.equal(r.formatSettings.tabSize, 2)
        assert.equal(r.formatSettings.convertTabsToSpaces, true)
    })

    it("lets --indent override win over the report's width", () => {
        const r = mergeRecommendations({indent: {width: 2}}, {indent: 4})
        assert.equal(r.formatSettings.indentSize, 4)
        assert.equal(r.formatSettings.tabSize, 4)
    })

    it("leaves indent fields undefined when neither side speaks", () => {
        const r = mergeRecommendations({}, {})
        assert.equal(r.formatSettings.indentSize, undefined)
        assert.equal(r.formatSettings.convertTabsToSpaces, undefined)
    })

    it("maps indent.width=tab → convertTabsToSpaces:false without indentSize", () => {
        const r = mergeRecommendations({indent: {width: "tab"}}, {})
        assert.equal(r.formatSettings.convertTabsToSpaces, false)
        assert.equal(r.formatSettings.indentSize, undefined)
        assert.equal(r.formatSettings.tabSize, undefined)
    })

    it("lets --indent tab override win over a numeric report width", () => {
        const r = mergeRecommendations({indent: {width: 2}}, {indent: "tab"})
        assert.equal(r.formatSettings.convertTabsToSpaces, false)
        assert.equal(r.formatSettings.indentSize, undefined)
    })

    it("maps semicolons=on → SemicolonPreference.Insert", () => {
        const r = mergeRecommendations({semicolons: {semicolons: "on"}}, {})
        assert.equal(r.formatSettings.semicolons, ts.SemicolonPreference.Insert)
    })

    it("maps semicolons=off → SemicolonPreference.Remove", () => {
        const r = mergeRecommendations({}, {semicolons: "off"})
        assert.equal(r.formatSettings.semicolons, ts.SemicolonPreference.Remove)
    })

    it("override beats the report for semicolons", () => {
        const r = mergeRecommendations({semicolons: {semicolons: "on"}}, {semicolons: "off"})
        assert.equal(r.formatSettings.semicolons, ts.SemicolonPreference.Remove)
    })

    it("maps bracketSpacing on/off to insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces", () => {
        const on = mergeRecommendations({bracketSpacing: {bracketSpacing: "on"}}, {})
        assert.equal(on.formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, true)
        const off = mergeRecommendations({}, {bracketSpacing: "off"})
        assert.equal(off.formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, false)
    })

    it("maps newLine lf → \\n + normalize target", () => {
        const r = mergeRecommendations({newLine: {newLine: "lf"}}, {})
        assert.equal(r.formatSettings.newLineCharacter, "\n")
        assert.equal(r.newLineNormalize, "\n")
        assert.equal(r.crRecommended, false)
    })

    it("maps newLine crlf → \\r\\n + normalize target", () => {
        const r = mergeRecommendations({}, {newLine: "crlf"})
        assert.equal(r.formatSettings.newLineCharacter, "\r\n")
        assert.equal(r.newLineNormalize, "\r\n")
    })

    it("acknowledges a cr recommendation but leaves newLineCharacter unset", () => {
        const r = mergeRecommendations({newLine: {newLine: "cr"}}, {})
        assert.equal(r.crRecommended, true)
        assert.equal(r.formatSettings.newLineCharacter, undefined)
        assert.equal(r.newLineNormalize, undefined)
    })

    it("an override silences the cr-recommended flag", () => {
        const r = mergeRecommendations({newLine: {newLine: "cr"}}, {newLine: "lf"})
        assert.equal(r.crRecommended, false)
        assert.equal(r.formatSettings.newLineCharacter, "\n")
    })

    it("organizeImports defaults to true under apply", () => {
        const r = mergeRecommendations({}, {})
        assert.equal(r.organizeImports, true)
    })

    it("--organize-imports off suppresses the organize pass", () => {
        const r = mergeRecommendations({}, {organizeImports: "off"})
        assert.equal(r.organizeImports, false)
    })

    it("--organize-imports on is the explicit form of the default", () => {
        const r = mergeRecommendations({}, {organizeImports: "on"})
        assert.equal(r.organizeImports, true)
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

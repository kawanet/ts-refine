import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import ts from "typescript"
import {formatStyleToSettings} from "./format-settings.ts"

describe("formatStyleToSettings", () => {
    it("maps a numeric indent to indentSize/tabSize + convertTabsToSpaces", () => {
        const r = formatStyleToSettings({indent: 2})
        assert.equal(r.indentSize, 2)
        assert.equal(r.tabSize, 2)
        assert.equal(r.convertTabsToSpaces, true)
    })

    it("maps indent=tab → convertTabsToSpaces:false without indentSize", () => {
        const r = formatStyleToSettings({indent: "tab"})
        assert.equal(r.convertTabsToSpaces, false)
        assert.equal(r.indentSize, undefined)
        assert.equal(r.tabSize, undefined)
    })

    it("leaves indent fields undefined when indent is unset", () => {
        const r = formatStyleToSettings({})
        assert.equal(r.indentSize, undefined)
        assert.equal(r.convertTabsToSpaces, undefined)
    })

    it("maps semicolons on/off to the SemicolonPreference", () => {
        assert.equal(formatStyleToSettings({semi: "on"}).semicolons, ts.SemicolonPreference.Insert)
        assert.equal(formatStyleToSettings({semi: "off"}).semicolons, ts.SemicolonPreference.Remove)
    })

    it("maps bracketSpacing on/off to the brace-padding flag", () => {
        assert.equal(formatStyleToSettings({bracketSpacing: "on"}).insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, true)
        assert.equal(formatStyleToSettings({bracketSpacing: "off"}).insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces, false)
    })

    it("keeps empty braces tight regardless of bracketSpacing", () => {
        // `export {}` must not become `export { }`; the empty-brace flag stays
        // false even when the non-empty axis is on or unset (Prettier parity).
        assert.equal(formatStyleToSettings({}).insertSpaceAfterOpeningAndBeforeClosingEmptyBraces, false)
        assert.equal(formatStyleToSettings({bracketSpacing: "on"}).insertSpaceAfterOpeningAndBeforeClosingEmptyBraces, false)
        assert.equal(formatStyleToSettings({bracketSpacing: "off"}).insertSpaceAfterOpeningAndBeforeClosingEmptyBraces, false)
    })

    it("maps newLine lf → \\n in newLineCharacter", () => {
        assert.equal(formatStyleToSettings({newLine: "lf"}).newLineCharacter, "\n")
    })

    it("maps newLine crlf → \\r\\n in newLineCharacter", () => {
        assert.equal(formatStyleToSettings({newLine: "crlf"}).newLineCharacter, "\r\n")
    })

    it("maps function spacing axes to TS LS settings", () => {
        const r = formatStyleToSettings({functionKeywordSpacing: "on", functionParenSpacing: "off", controlKeywordSpacing: "on"})
        assert.equal(r.insertSpaceAfterFunctionKeywordForAnonymousFunctions, true)
        assert.equal(r.insertSpaceBeforeFunctionParenthesis, false)
        assert.equal(r.insertSpaceAfterConstructor, false)
        assert.equal(r.insertSpaceAfterKeywordsInControlFlowStatements, true)
    })
})

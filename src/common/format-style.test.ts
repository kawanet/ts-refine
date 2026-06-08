import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {reportToFormatStyle} from "./format-style.ts"

describe("reportToFormatStyle", () => {
    it("maps the actionable report fields", () => {
        const o = reportToFormatStyle({
            semi: {semi: "on"},
            indent: {width: 4},
            newLine: {newLine: "crlf"},
            bracketSpacing: {bracketSpacing: "off"},
        })
        assert.deepEqual(o, {semi: "on", indent: 4, newLine: "crlf", bracketSpacing: "off"})
    })

    it("carries indent.width=tab through", () => {
        assert.equal(reportToFormatStyle({indent: {width: "tab"}}).indent, "tab")
    })

    it("maps member-delimiter through (the format command applies it via a self-pass)", () => {
        const o = reportToFormatStyle({memberDelimiter: {delimiter: "comma"}})
        assert.deepEqual(o, {memberDelimiter: "comma"})
    })

    it("maps function-spacing through to the three format style fields", () => {
        const o = reportToFormatStyle({functionSpacing: {functionKeywordSpacing: "on", functionParenSpacing: "off", controlKeywordSpacing: "on"}})
        assert.deepEqual(o, {functionKeywordSpacing: "on", functionParenSpacing: "off", controlKeywordSpacing: "on"})
    })
})

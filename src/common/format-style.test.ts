import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {reportToFormatStyle} from "./format-style.ts"

describe("reportToFormatStyle", () => {
    it("maps the actionable report fields", () => {
        const o = reportToFormatStyle({
            semicolons: {semicolons: "on"},
            indent: {width: 4},
            newLine: {newLine: "crlf"},
            bracketSpacing: {bracketSpacing: "off"},
        })
        assert.deepEqual(o, {semicolons: "on", indent: 4, newLine: "crlf", bracketSpacing: "off"})
    })

    it("carries indent.width=tab through", () => {
        assert.equal(reportToFormatStyle({indent: {width: "tab"}}).indent, "tab")
    })

    it("discards a cr newline recommendation (not a runnable flag nor an LS setting)", () => {
        const o = reportToFormatStyle({newLine: {newLine: "cr"}})
        assert.equal(o.newLine, undefined)
    })

    it("ignores member-separators (no actionable mapping)", () => {
        const o = reportToFormatStyle({memberSeparators: {separator: "comma"}})
        assert.deepEqual(o, {})
    })
})

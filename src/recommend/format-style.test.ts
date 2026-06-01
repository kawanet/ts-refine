import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {reportToFormatOptions} from "./format-style.ts"

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

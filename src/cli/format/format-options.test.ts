import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {mergeFormatOptions, overridesToFormatOptions, reportNamesForFormat} from "./format-options.ts"

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

describe("reportNamesForFormat", () => {
    it("surveys the full apply set when nothing is overridden", () => {
        assert.deepEqual(reportNamesForFormat({}), ["semicolons", "indent", "new-line", "bracket-spacing"])
    })

    it("drops the report for each pinned field", () => {
        assert.deepEqual(reportNamesForFormat({indent: 4}), ["semicolons", "new-line", "bracket-spacing"])
        assert.deepEqual(reportNamesForFormat({newLine: "lf"}), ["semicolons", "indent", "bracket-spacing"])
    })

    it("returns an empty set when every surveyed field is pinned", () => {
        const all = {semicolons: "on", indent: 2, newLine: "lf", bracketSpacing: "off"} as const
        assert.deepEqual(reportNamesForFormat(all), [])
    })

    it("ignores organize-imports, which has no report to skip", () => {
        assert.deepEqual(reportNamesForFormat({organizeImports: "off"}), ["semicolons", "indent", "new-line", "bracket-spacing"])
    })
})

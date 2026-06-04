import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {mergeFormatStyles, reportNamesForFormat} from "./format-options.ts"

describe("mergeFormatStyles", () => {
    it("lets the override win per field, falling back to the base", () => {
        const merged = mergeFormatStyles({semicolons: "on", indent: 2}, {indent: 4})
        assert.equal(merged.semicolons, "on")
        assert.equal(merged.indent, 4)
    })

    it("leaves a field unset when neither side speaks", () => {
        assert.equal(mergeFormatStyles({}, {}).bracketSpacing, undefined)
    })
})

describe("reportNamesForFormat", () => {
    it("surveys the full apply set when nothing is overridden", () => {
        assert.deepEqual(reportNamesForFormat({}), ["semicolons", "indent", "member-separators", "new-line", "bracket-spacing", "trailing-comma"])
    })

    it("drops the report for each pinned field", () => {
        assert.deepEqual(reportNamesForFormat({indent: 4}), ["semicolons", "member-separators", "new-line", "bracket-spacing", "trailing-comma"])
        assert.deepEqual(reportNamesForFormat({newLine: "lf"}), ["semicolons", "indent", "member-separators", "bracket-spacing", "trailing-comma"])
        assert.deepEqual(reportNamesForFormat({memberSeparators: "semi"}), ["semicolons", "indent", "new-line", "bracket-spacing", "trailing-comma"])
        assert.deepEqual(reportNamesForFormat({trailingComma: "on"}), ["semicolons", "indent", "member-separators", "new-line", "bracket-spacing"])
    })

    it("returns an empty set when every surveyed field is pinned", () => {
        const all = {semicolons: "on", indent: 2, memberSeparators: "semi", newLine: "lf", bracketSpacing: "off", trailingComma: "on"} as const
        assert.deepEqual(reportNamesForFormat(all), [])
    })
})

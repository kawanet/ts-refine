import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "../../../types/ts-refine"
import {mergeFormatStyles, reportNamesForFormat} from "./format-options.ts"

describe("mergeFormatStyles", () => {
    it("lets the override win per field, falling back to the base", () => {
        const merged = mergeFormatStyles({semi: "on", indent: 2}, {indent: 4})
        assert.equal(merged.semi, "on")
        assert.equal(merged.indent, 4)
    })

    it("leaves a field unset when neither side speaks", () => {
        assert.equal(mergeFormatStyles({}, {}).bracketSpacing, undefined)
    })
})

describe("reportNamesForFormat", () => {
    it("surveys the full apply set when nothing is overridden", () => {
        assert.deepEqual(reportNamesForFormat({}), ["semi", "indent", "member-delimiter", "new-line", "bracket-spacing", "trailing-comma", "function-spacing"])
    })

    it("drops the report for each pinned field", () => {
        assert.deepEqual(reportNamesForFormat({indent: 4}), ["semi", "member-delimiter", "new-line", "bracket-spacing", "trailing-comma", "function-spacing"])
        assert.deepEqual(reportNamesForFormat({newLine: "lf"}), ["semi", "indent", "member-delimiter", "bracket-spacing", "trailing-comma", "function-spacing"])
        assert.deepEqual(reportNamesForFormat({memberDelimiter: "semi"}), ["semi", "indent", "new-line", "bracket-spacing", "trailing-comma", "function-spacing"])
        assert.deepEqual(reportNamesForFormat({trailingComma: "on"}), ["semi", "indent", "member-delimiter", "new-line", "bracket-spacing", "function-spacing"])
    })

    it("returns an empty set when every surveyed field is pinned", () => {
        const all: TSR.FormatStyle = {
            semi: "on",
            indent: 2,
            memberDelimiter: "semi",
            newLine: "lf",
            bracketSpacing: "off",
            trailingComma: "on",
            anonymousFunctionSpacing: "on",
            namedFunctionSpacing: "off",
            controlKeywordSpacing: "on",
        }
        assert.deepEqual(reportNamesForFormat(all), [])
    })

    it("keeps function-spacing until all three function spacing fields are pinned", () => {
        assert.ok(reportNamesForFormat({anonymousFunctionSpacing: "on"}).includes("function-spacing"))
        assert.ok(reportNamesForFormat({anonymousFunctionSpacing: "on", namedFunctionSpacing: "off"}).includes("function-spacing"))
        assert.equal(reportNamesForFormat({anonymousFunctionSpacing: "on", namedFunctionSpacing: "off", controlKeywordSpacing: "on"}).includes("function-spacing"), false)
    })
})

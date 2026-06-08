import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {renderSections, writeReportSections} from "./write-report-sections.ts"

describe("renderSections", () => {
    it("renders heading, header, separator, rows; a blank cell is `|  |` (two spaces)", () => {
        const out = renderSections([
            {
                title: "--semi on",
                table: [
                    ["a", "b"],
                    ["x", ""],
                    ["total", ""],
                ],
            },
        ])
        assert.equal(out, "### --semi on\n\n| a | b |\n| --- | --- |\n| x |  |\n| total |  |\n\n")
    })
})

describe("writeReportSections", () => {
    it("writes each report's sections in registry order, not object key order", () => {
        const lines: string[] = []
        const report: TSR.ReportResult = {
            // Listed indent-before-semi on purpose; the registry order is the reverse.
            indent: {sections: [{title: "(indent)", table: [["indent"], ["tab"]]}]},
            semi: {sections: [{title: "--semi on", table: [["semi"], ["on"]]}]},
        }
        writeReportSections(report, {write: (l) => lines.push(l)})

        const out = lines.join("")
        assert.ok(out.indexOf("--semi on") < out.indexOf("(indent)"), "semi precedes indent in the registry")
    })
})

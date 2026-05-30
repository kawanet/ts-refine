import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {selectOutput} from "./select-output.ts"

type Writer = TSR.ReportOpts["stream"]

function makeStdout(): {writer: Writer; out: () => string} {
    let out = ""
    return {writer: {write: (s) => (out += s)}, out: () => out}
}

describe("selectOutput", () => {
    it("returns a no-op finalize and the stdout stream when no output is selected", () => {
        const {writer, out} = makeStdout()
        const f = selectOutput(null, writer)
        assert.equal(f.reportStream, writer)
        f.finalize({semicolons: {semicolons: "off"}})
        assert.equal(out(), "")
    })

    it("swaps the report stream for a sink and writes prettier JSON on finalize", () => {
        const {writer, out} = makeStdout()
        const f = selectOutput("prettier", writer)
        // Markdown body would have been written here — sink swallows it.
        f.reportStream.write("### dropped\n")
        assert.equal(out(), "")
        f.finalize({semicolons: {semicolons: "off"}, indent: {width: 4}})
        const json = JSON.parse(out())
        assert.equal(json.semi, false)
        assert.equal(json.tabWidth, 4)
        assert.equal(json.useTabs, false)
    })

    it("swaps the report stream for a sink and writes the format command on finalize", () => {
        const {writer, out} = makeStdout()
        const f = selectOutput("ts-refine", writer)
        f.reportStream.write("### dropped\n")
        assert.equal(out(), "")
        f.finalize({semicolons: {semicolons: "off"}, indent: {width: 4}, memberSeparators: {separator: "none"}})
        // Two-line form: `ts-refine \` continuation, then the flags
        // indented by two spaces so `grep '^ +--'` picks them up.
        // member-separators is report-only, so it never reaches the command.
        assert.equal(out(), "ts-refine format \\\n  --semicolons off --indent 4\n")
    })

    it("throws on an unknown output name", () => {
        const {writer} = makeStdout()
        assert.throws(() => selectOutput("typo-format", writer), /unknown --output: typo-format/)
    })
})

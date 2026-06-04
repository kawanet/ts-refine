import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getTsRefineFormat, writeFormatCommand, writeFormatMarkdown} from "./emit-ts-refine.ts"

function capture(fn: (s: {write: (chunk: string) => void}) => void): string {
    let out = ""
    fn({write: (s) => (out += s)})
    return out
}

// getTsRefineFormat takes a FormatStyle (the format command's apply value),
// so these pin the FormatStyle → flag-string mapping. The ReportResult →
// FormatStyle conversion is covered by format-style.test.ts; the framing
// (`ts-refine format \`) is covered by select-emitter.test.ts.
describe("getTsRefineFormat", () => {
    it("maps semicolons=off → --semicolons off", () => {
        assert.equal(getTsRefineFormat({semicolons: "off"}), "--semicolons off")
    })

    it("maps semicolons=on → --semicolons on", () => {
        assert.equal(getTsRefineFormat({semicolons: "on"}), "--semicolons on")
    })

    it("maps indent → --indent N", () => {
        assert.equal(getTsRefineFormat({indent: 4}), "--indent 4")
    })

    it("maps indent=tab → --indent tab", () => {
        assert.equal(getTsRefineFormat({indent: "tab"}), "--indent tab")
    })

    it("maps newLine → --new-line V", () => {
        assert.equal(getTsRefineFormat({newLine: "lf"}), "--new-line lf")
    })

    it("maps bracketSpacing → --bracket-spacing V", () => {
        assert.equal(getTsRefineFormat({bracketSpacing: "on"}), "--bracket-spacing on")
    })

    it("combines all fields in a fixed order regardless of input key order", () => {
        const out = getTsRefineFormat(
            // Input keys are intentionally reversed; the output order is fixed.
            {bracketSpacing: "on", newLine: "lf", indent: 4, semicolons: "off"},
        )
        assert.equal(out, "--semicolons off --indent 4 --new-line lf --bracket-spacing on")
    })

    it("returns an empty string when nothing was recommended", () => {
        // Symmetric with `--emit prettier` emitting an empty `{}` for the same case.
        assert.equal(getTsRefineFormat({}), "")
    })
})

// The flag mapping is covered above; these pin the framing getTsRefineFormat
// feeds — most importantly the empty branch, which select-emitter.test.ts
// (non-empty only) does not exercise.
describe("writeFormatCommand", () => {
    it("emits a bare `ts-refine format` when nothing was recommended", () => {
        const out = capture((s) => writeFormatCommand({}, s))
        assert.equal(out, "ts-refine format\n")
    })

    it("frames the flags on a continued second line", () => {
        const out = capture((s) => writeFormatCommand({semicolons: {semicolons: "off"}}, s))
        assert.equal(out, "ts-refine format \\\n  --semicolons off\n")
    })
})

describe("writeFormatMarkdown", () => {
    it("wraps the command in a `## recommendation` fenced block", () => {
        const out = capture((s) => writeFormatMarkdown({semicolons: {semicolons: "off"}, indent: {width: 4}}, s))
        assert.match(out, /^## recommendation\n\n```sh\nts-refine format \\\n/)
        assert.match(out, /\n {2}--semicolons off --indent 4\n```\n\n$/)
    })

    it("emits nothing when no recommendations fired (no empty ## recommendation block)", () => {
        const out = capture((s) => writeFormatMarkdown({}, s))
        assert.equal(out, "")
    })
})

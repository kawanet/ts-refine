import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getTsRefineFormat, writeFormatMarkdown} from "./emit-ts-refine.ts"

function capture(fn: (s: {write: (chunk: string) => void}) => void): string {
    let out = ""
    fn({write: (s) => (out += s)})
    return out
}

// The framing (`ts-refine format \`) that getTsRefineFormat feeds is
// covered by select-emitter.test.ts.
describe("getTsRefineFormat", () => {
    it("maps semicolons.semicolons=off → --semicolons off", () => {
        assert.equal(getTsRefineFormat({semicolons: {semicolons: "off"}}), "--semicolons off")
    })

    it("maps semicolons.semicolons=on → --semicolons on", () => {
        assert.equal(getTsRefineFormat({semicolons: {semicolons: "on"}}), "--semicolons on")
    })

    it("maps indent.width → --indent N", () => {
        assert.equal(getTsRefineFormat({indent: {width: 4}}), "--indent 4")
    })

    it("maps indent.width=tab → --indent tab", () => {
        assert.equal(getTsRefineFormat({indent: {width: "tab"}}), "--indent tab")
    })

    it("omits memberSeparators (report-only; the format command does not consume it)", () => {
        assert.equal(getTsRefineFormat({memberSeparators: {separator: "none"}}), "")
    })

    it("maps newLine.newLine → --new-line V", () => {
        assert.equal(getTsRefineFormat({newLine: {newLine: "lf"}}), "--new-line lf")
    })

    it("maps bracketSpacing.bracketSpacing → --bracket-spacing V", () => {
        assert.equal(getTsRefineFormat({bracketSpacing: {bracketSpacing: "on"}}), "--bracket-spacing on")
    })

    it("combines all recommendations in a fixed order, omitting member-separators", () => {
        const out = getTsRefineFormat(
            // Input keys are intentionally reversed; the output order is fixed.
            {bracketSpacing: {bracketSpacing: "on"}, newLine: {newLine: "lf"}, memberSeparators: {separator: "none"}, indent: {width: 4}, semicolons: {semicolons: "off"}},
        )
        assert.equal(out, "--semicolons off --indent 4 --new-line lf --bracket-spacing on")
    })

    it("returns an empty string when nothing was recommended", () => {
        // Symmetric with `--emit prettier` emitting an empty `{}` for the same case.
        assert.equal(getTsRefineFormat({}), "")
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

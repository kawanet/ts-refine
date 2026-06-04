import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getTsRefineFormat, writeFormatCommand, writeFormatMarkdown} from "./emit-ts-refine.ts"

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

    it("maps memberSeparators.separator → --member-separators V (the format command applies it)", () => {
        assert.equal(getTsRefineFormat({memberSeparators: {separator: "none"}}), "--member-separators none")
        assert.equal(getTsRefineFormat({memberSeparators: {separator: "comma"}}), "--member-separators comma")
    })

    it("maps newLine.newLine → --new-line V", () => {
        assert.equal(getTsRefineFormat({newLine: {newLine: "lf"}}), "--new-line lf")
    })

    it("maps bracketSpacing.bracketSpacing → --bracket-spacing V", () => {
        assert.equal(getTsRefineFormat({bracketSpacing: {bracketSpacing: "on"}}), "--bracket-spacing on")
    })

    it("maps trailingComma.trailingComma → --trailing-comma V", () => {
        assert.equal(getTsRefineFormat({trailingComma: {trailingComma: "on"}}), "--trailing-comma on")
        assert.equal(getTsRefineFormat({trailingComma: {trailingComma: "off"}}), "--trailing-comma off")
    })

    it("combines all recommendations in a fixed order", () => {
        const out = getTsRefineFormat(
            // Input keys are intentionally reversed; the output order is fixed.
            {trailingComma: {trailingComma: "on"}, bracketSpacing: {bracketSpacing: "on"}, newLine: {newLine: "lf"}, memberSeparators: {separator: "none"}, indent: {width: 4}, semicolons: {semicolons: "off"}},
        )
        assert.equal(out, "--semicolons off --indent 4 --member-separators none --new-line lf --bracket-spacing on --trailing-comma on")
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

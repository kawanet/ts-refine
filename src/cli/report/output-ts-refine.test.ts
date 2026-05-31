import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {writeFormatCommand, writeFormatMarkdown} from "./output-ts-refine.ts"

function capture(fn: (s: {write: (chunk: string) => void}) => void): string {
    let out = ""
    fn({write: (s) => (out += s)})
    return out
}

describe("writeFormatCommand", () => {
    it("maps semicolons.semicolons=off → --semicolons off", () => {
        const out = capture((s) => writeFormatCommand({semicolons: {semicolons: "off"}}, s))
        assert.equal(out, "ts-refine format \\\n  --semicolons off\n")
    })

    it("maps semicolons.semicolons=on → --semicolons on", () => {
        const out = capture((s) => writeFormatCommand({semicolons: {semicolons: "on"}}, s))
        assert.equal(out, "ts-refine format \\\n  --semicolons on\n")
    })

    it("maps indent.width → --indent N", () => {
        const out = capture((s) => writeFormatCommand({indent: {width: 4}}, s))
        assert.equal(out, "ts-refine format \\\n  --indent 4\n")
    })

    it("maps indent.width=tab → --indent tab", () => {
        const out = capture((s) => writeFormatCommand({indent: {width: "tab"}}, s))
        assert.equal(out, "ts-refine format \\\n  --indent tab\n")
    })

    it("omits memberSeparators (report-only; the format command does not consume it)", () => {
        const out = capture((s) => writeFormatCommand({memberSeparators: {separator: "none"}}, s))
        assert.equal(out, "ts-refine format\n")
    })

    it("maps newLine.newLine → --new-line V", () => {
        const out = capture((s) => writeFormatCommand({newLine: {newLine: "lf"}}, s))
        assert.equal(out, "ts-refine format \\\n  --new-line lf\n")
    })

    it("maps bracketSpacing.bracketSpacing → --bracket-spacing V", () => {
        const out = capture((s) => writeFormatCommand({bracketSpacing: {bracketSpacing: "on"}}, s))
        assert.equal(out, "ts-refine format \\\n  --bracket-spacing on\n")
    })

    it("combines all recommendations in a fixed order, omitting member-separators", () => {
        const out = capture((s) =>
            writeFormatCommand(
                // Input keys are intentionally reversed; the output order is fixed.
                {bracketSpacing: {bracketSpacing: "on"}, newLine: {newLine: "lf"}, memberSeparators: {separator: "none"}, indent: {width: 4}, semicolons: {semicolons: "off"}},
                s,
            ),
        )
        assert.equal(out, "ts-refine format \\\n  --semicolons off --indent 4 --new-line lf --bracket-spacing on\n")
    })

    it("emits a bare `ts-refine format` when nothing was recommended", () => {
        // Symmetric with `--output prettier` emitting an empty `{}` for the same case.
        const out = capture((s) => writeFormatCommand({}, s))
        assert.equal(out, "ts-refine format\n")
    })

    it("keeps the args on a separate line so `grep '^ +--'` extracts flags only", () => {
        const out = capture((s) => writeFormatCommand({semicolons: {semicolons: "off"}}, s))
        const second = out.split("\n")[1]
        assert.match(second, /^ +--/)
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

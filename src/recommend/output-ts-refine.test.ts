import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {writeReformatCommand, writeReformatMarkdown} from "./output-ts-refine.ts"

function capture(fn: (s: {write: (chunk: string) => void}) => void): string {
    let out = ""
    fn({write: (s) => (out += s)})
    return out
}

describe("writeReformatCommand", () => {
    it("maps semicolons.semicolons=off → --semicolons off", () => {
        const out = capture((s) => writeReformatCommand({semicolons: {semicolons: "off"}}, s))
        assert.equal(out, "ts-survey reformat \\\n  --semicolons off\n")
    })

    it("maps semicolons.semicolons=on → --semicolons on", () => {
        const out = capture((s) => writeReformatCommand({semicolons: {semicolons: "on"}}, s))
        assert.equal(out, "ts-survey reformat \\\n  --semicolons on\n")
    })

    it("maps indent.width → --indent N", () => {
        const out = capture((s) => writeReformatCommand({indent: {width: 4}}, s))
        assert.equal(out, "ts-survey reformat \\\n  --indent 4\n")
    })

    it("maps indent.width=tab → --indent tab", () => {
        const out = capture((s) => writeReformatCommand({indent: {width: "tab"}}, s))
        assert.equal(out, "ts-survey reformat \\\n  --indent tab\n")
    })

    it("omits memberSeparators (report-only; the reformat command does not consume it)", () => {
        const out = capture((s) => writeReformatCommand({memberSeparators: {separator: "none"}}, s))
        assert.equal(out, "ts-survey reformat\n")
    })

    it("maps newLine.newLine → --new-line V", () => {
        const out = capture((s) => writeReformatCommand({newLine: {newLine: "lf"}}, s))
        assert.equal(out, "ts-survey reformat \\\n  --new-line lf\n")
    })

    it("maps bracketSpacing.bracketSpacing → --bracket-spacing V", () => {
        const out = capture((s) => writeReformatCommand({bracketSpacing: {bracketSpacing: "on"}}, s))
        assert.equal(out, "ts-survey reformat \\\n  --bracket-spacing on\n")
    })

    it("combines all recommendations in a fixed order, omitting member-separators", () => {
        const out = capture((s) =>
            writeReformatCommand(
                // Input keys are intentionally reversed; the output order is fixed.
                {bracketSpacing: {bracketSpacing: "on"}, newLine: {newLine: "lf"}, memberSeparators: {separator: "none"}, indent: {width: 4}, semicolons: {semicolons: "off"}},
                s,
            ),
        )
        assert.equal(out, "ts-survey reformat \\\n  --semicolons off --indent 4 --new-line lf --bracket-spacing on\n")
    })

    it("emits a bare `ts-survey reformat` when nothing was recommended", () => {
        // Symmetric with `--output prettier` emitting an empty `{}` for the same case.
        const out = capture((s) => writeReformatCommand({}, s))
        assert.equal(out, "ts-survey reformat\n")
    })

    it("keeps the args on a separate line so `grep '^ +--'` extracts flags only", () => {
        const out = capture((s) => writeReformatCommand({semicolons: {semicolons: "off"}}, s))
        const second = out.split("\n")[1]
        assert.match(second, /^ +--/)
    })
})

describe("writeReformatMarkdown", () => {
    it("wraps the command in a `## recommendation` fenced block", () => {
        const out = capture((s) => writeReformatMarkdown({semicolons: {semicolons: "off"}, indent: {width: 4}}, s))
        assert.match(out, /^## recommendation\n\n```sh\nts-survey reformat \\\n/)
        assert.match(out, /\n {2}--semicolons off --indent 4\n```\n\n$/)
    })

    it("emits nothing when no recommendations fired (no empty ## recommendation block)", () => {
        const out = capture((s) => writeReformatMarkdown({}, s))
        assert.equal(out, "")
    })
})

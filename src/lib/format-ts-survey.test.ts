import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {writeTsSurveyCommand, writeTsSurveyMarkdown} from "./format-ts-survey.ts"

function capture(fn: (s: {write: (chunk: string) => void}) => void): string {
    let out = ""
    fn({write: (s) => (out += s)})
    return out
}

describe("writeTsSurveyCommand", () => {
    it("maps semicolons.semicolons=off → --semicolons off", () => {
        const out = capture((s) => writeTsSurveyCommand({semicolons: {semicolons: "off"}}, s))
        assert.equal(out, "ts-survey --apply \\\n  --semicolons off\n")
    })

    it("maps semicolons.semicolons=on → --semicolons on", () => {
        const out = capture((s) => writeTsSurveyCommand({semicolons: {semicolons: "on"}}, s))
        assert.equal(out, "ts-survey --apply \\\n  --semicolons on\n")
    })

    it("maps indent.width → --indent N", () => {
        const out = capture((s) => writeTsSurveyCommand({indent: {width: 4}}, s))
        assert.equal(out, "ts-survey --apply \\\n  --indent 4\n")
    })

    it("maps indent.width=tab → --indent tab", () => {
        const out = capture((s) => writeTsSurveyCommand({indent: {width: "tab"}}, s))
        assert.equal(out, "ts-survey --apply \\\n  --indent tab\n")
    })

    it("omits memberSeparators (report-only; --apply does not consume it)", () => {
        const out = capture((s) => writeTsSurveyCommand({memberSeparators: {separator: "none"}}, s))
        assert.equal(out, "ts-survey --apply\n")
    })

    it("maps newLine.newLine → --new-line V", () => {
        const out = capture((s) => writeTsSurveyCommand({newLine: {newLine: "lf"}}, s))
        assert.equal(out, "ts-survey --apply \\\n  --new-line lf\n")
    })

    it("maps bracketSpacing.bracketSpacing → --bracket-spacing V", () => {
        const out = capture((s) => writeTsSurveyCommand({bracketSpacing: {bracketSpacing: "on"}}, s))
        assert.equal(out, "ts-survey --apply \\\n  --bracket-spacing on\n")
    })

    it("combines all recommendations in a fixed order, omitting member-separators", () => {
        const out = capture((s) =>
            writeTsSurveyCommand(
                // Input keys are intentionally reversed; the output order is fixed.
                {bracketSpacing: {bracketSpacing: "on"}, newLine: {newLine: "lf"}, memberSeparators: {separator: "none"}, indent: {width: 4}, semicolons: {semicolons: "off"}},
                s,
            ),
        )
        assert.equal(out, "ts-survey --apply \\\n  --semicolons off --indent 4 --new-line lf --bracket-spacing on\n")
    })

    it("emits a bare `ts-survey --apply` when nothing was recommended", () => {
        // Symmetric with `--format prettier` emitting an empty `{}` for the same case.
        const out = capture((s) => writeTsSurveyCommand({}, s))
        assert.equal(out, "ts-survey --apply\n")
    })

    it("keeps the args on a separate line so `grep '^ +--'` extracts flags only", () => {
        const out = capture((s) => writeTsSurveyCommand({semicolons: {semicolons: "off"}}, s))
        const second = out.split("\n")[1]
        assert.match(second, /^ +--/)
    })
})

describe("writeTsSurveyMarkdown", () => {
    it("wraps the command in a `## recommendation` fenced block", () => {
        const out = capture((s) => writeTsSurveyMarkdown({semicolons: {semicolons: "off"}, indent: {width: 4}}, s))
        assert.match(out, /^## recommendation\n\n```sh\nts-survey --apply \\\n/)
        assert.match(out, /\n {2}--semicolons off --indent 4\n```\n\n$/)
    })

    it("emits nothing when no recommendations fired (no empty ## recommendation block)", () => {
        const out = capture((s) => writeTsSurveyMarkdown({}, s))
        assert.equal(out, "")
    })
})

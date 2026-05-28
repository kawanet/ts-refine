import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {writePrettierConfig, writePrettierMarkdown} from "./format-prettier.ts"

function capture(report: Parameters<typeof writePrettierConfig>[0]): string {
    let out = ""
    writePrettierConfig(report, {write: (s) => (out += s)})
    return out
}

describe("writePrettierConfig", () => {
    it("maps semicolons.semicolons=off → semi: false", () => {
        const out = capture({semicolons: {semicolons: "off"}})
        assert.equal(JSON.parse(out).semi, false)
    })

    it("maps semicolons.semicolons=on → semi: true", () => {
        const out = capture({semicolons: {semicolons: "on"}})
        assert.equal(JSON.parse(out).semi, true)
    })

    it("maps indent.width → tabWidth + useTabs: false", () => {
        const out = capture({indent: {width: 4}})
        const json = JSON.parse(out)
        assert.equal(json.tabWidth, 4)
        assert.equal(json.useTabs, false)
    })

    it("renders an empty {} when nothing was recommended", () => {
        const out = capture({})
        assert.equal(out.trimEnd(), "{}")
    })

    it("combines multiple recommendations into one JSON object", () => {
        const out = capture({semicolons: {semicolons: "off"}, indent: {width: 2}})
        const json = JSON.parse(out)
        assert.equal(json.semi, false)
        assert.equal(json.tabWidth, 2)
        assert.equal(json.useTabs, false)
    })

    it("uses 4-space indentation matching the family .prettierrc convention", () => {
        const out = capture({semicolons: {semicolons: "off"}})
        assert.match(out, /\n {4}"semi":/)
    })

    it("maps memberSeparators.separator=semi → semi: true (when semicolons is silent)", () => {
        const json = JSON.parse(capture({memberSeparators: {separator: "semi"}}))
        assert.equal(json.semi, true)
        // Members are separated by `;` under semi:true, so trailingComma adds nothing.
        assert.equal(json.trailingComma, undefined)
    })

    it("maps memberSeparators.separator=comma → semi: false + trailingComma: 'all'", () => {
        const json = JSON.parse(capture({memberSeparators: {separator: "comma"}}))
        assert.equal(json.semi, false)
        assert.equal(json.trailingComma, "all")
    })

    it("maps memberSeparators.separator=none → semi: false + trailingComma: 'none'", () => {
        const json = JSON.parse(capture({memberSeparators: {separator: "none"}}))
        assert.equal(json.semi, false)
        assert.equal(json.trailingComma, "none")
    })

    it("combines semicolons=off with member=none into semi:false + trailingComma:'none'", () => {
        const json = JSON.parse(capture({semicolons: {semicolons: "off"}, memberSeparators: {separator: "none"}}))
        assert.equal(json.semi, false)
        assert.equal(json.trailingComma, "none")
    })

    it("lets semicolons win the semi flag when the two reports disagree", () => {
        // semicolons:on × member=none is contradictory. Keep semi:true (the
        // stronger signal) and drop trailingComma rather than emit a self-conflict.
        const json = JSON.parse(capture({semicolons: {semicolons: "on"}, memberSeparators: {separator: "none"}}))
        assert.equal(json.semi, true)
        assert.equal(json.trailingComma, undefined)
    })

    it("maps newLine.newLine=lf → endOfLine: 'lf'", () => {
        const json = JSON.parse(capture({newLine: {newLine: "lf"}}))
        assert.equal(json.endOfLine, "lf")
    })

    it("maps newLine.newLine=crlf → endOfLine: 'crlf'", () => {
        const json = JSON.parse(capture({newLine: {newLine: "crlf"}}))
        assert.equal(json.endOfLine, "crlf")
    })

    it("maps bracketSpacing.bracketSpacing=on → bracketSpacing: true", () => {
        const json = JSON.parse(capture({bracketSpacing: {bracketSpacing: "on"}}))
        assert.equal(json.bracketSpacing, true)
    })

    it("maps bracketSpacing.bracketSpacing=off → bracketSpacing: false", () => {
        const json = JSON.parse(capture({bracketSpacing: {bracketSpacing: "off"}}))
        assert.equal(json.bracketSpacing, false)
    })
})

describe("writePrettierMarkdown", () => {
    function captureMd(report: Parameters<typeof writePrettierMarkdown>[0]): string {
        let out = ""
        writePrettierMarkdown(report, {write: (s) => (out += s)})
        return out
    }

    it("wraps the JSON in a `### .prettierrc` fenced block ending in a trailing blank line", () => {
        const out = captureMd({semicolons: {semicolons: "off"}, indent: {width: 4}})
        // Section header + table-style blank + fence open + body + fence close + trailing blank.
        assert.match(out, /^### \.prettierrc\n\n```json\n/)
        assert.match(out, /\n```\n\n$/)
        const jsonBody = out.match(/```json\n([\s\S]*?)\n```/)?.[1]
        assert.ok(jsonBody)
        const parsed = JSON.parse(jsonBody!)
        assert.equal(parsed.semi, false)
        assert.equal(parsed.tabWidth, 4)
        assert.equal(parsed.useTabs, false)
    })

    it("emits nothing when no recommendations fired", () => {
        assert.equal(captureMd({}), "")
    })
})

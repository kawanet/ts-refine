import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getPrettierConfig, writePrettierMarkdown} from "./emit-prettier.ts"

function capture(report: Parameters<typeof getPrettierConfig>[0]): string {
    return getPrettierConfig(report)
}

describe("getPrettierConfig", () => {
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

    it("maps indent.width=tab → useTabs: true without tabWidth", () => {
        const json = JSON.parse(capture({indent: {width: "tab"}}))
        assert.equal(json.useTabs, true)
        assert.equal(json.tabWidth, undefined)
    })

    it("ignores memberSeparators (comma members are unreachable in Prettier)", () => {
        const json = JSON.parse(capture({memberSeparators: {separator: "comma"}}))
        assert.deepEqual(json, {})
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

    it("maps trailingComma.trailingComma=on → trailingComma: all, off → none", () => {
        assert.equal(JSON.parse(capture({trailingComma: {trailingComma: "on"}})).trailingComma, "all")
        assert.equal(JSON.parse(capture({trailingComma: {trailingComma: "off"}})).trailingComma, "none")
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

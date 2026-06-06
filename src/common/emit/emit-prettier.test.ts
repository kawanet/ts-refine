import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getPrettierConfig} from "./emit-prettier.ts"

describe("getPrettierConfig", () => {
    it("maps semi.semi=off → semi: false", () => {
        const out = getPrettierConfig({semi: {semi: "off"}})
        assert.equal(JSON.parse(out).semi, false)
    })

    it("maps semi.semi=on → semi: true", () => {
        const out = getPrettierConfig({semi: {semi: "on"}})
        assert.equal(JSON.parse(out).semi, true)
    })

    it("maps indent.width → tabWidth + useTabs: false", () => {
        const out = getPrettierConfig({indent: {width: 4}})
        const json = JSON.parse(out)
        assert.equal(json.tabWidth, 4)
        assert.equal(json.useTabs, false)
    })

    it("renders an empty {} when nothing was recommended", () => {
        const out = getPrettierConfig({})
        assert.equal(out.trimEnd(), "{}")
    })

    it("combines multiple recommendations into one JSON object", () => {
        const out = getPrettierConfig({semi: {semi: "off"}, indent: {width: 2}})
        const json = JSON.parse(out)
        assert.equal(json.semi, false)
        assert.equal(json.tabWidth, 2)
        assert.equal(json.useTabs, false)
    })

    it("uses 4-space indentation matching the family .prettierrc convention", () => {
        const out = getPrettierConfig({semi: {semi: "off"}})
        assert.match(out, /\n {4}"semi":/)
    })

    it("maps indent.width=tab → useTabs: true without tabWidth", () => {
        const json = JSON.parse(getPrettierConfig({indent: {width: "tab"}}))
        assert.equal(json.useTabs, true)
        assert.equal(json.tabWidth, undefined)
    })

    it("ignores memberDelimiter (comma members are unreachable in Prettier)", () => {
        const json = JSON.parse(getPrettierConfig({memberDelimiter: {delimiter: "comma"}}))
        assert.deepEqual(json, {})
    })

    it("maps newLine.newLine=lf → endOfLine: 'lf'", () => {
        const json = JSON.parse(getPrettierConfig({newLine: {newLine: "lf"}}))
        assert.equal(json.endOfLine, "lf")
    })

    it("maps newLine.newLine=crlf → endOfLine: 'crlf'", () => {
        const json = JSON.parse(getPrettierConfig({newLine: {newLine: "crlf"}}))
        assert.equal(json.endOfLine, "crlf")
    })

    it("maps bracketSpacing.bracketSpacing=on → bracketSpacing: true", () => {
        const json = JSON.parse(getPrettierConfig({bracketSpacing: {bracketSpacing: "on"}}))
        assert.equal(json.bracketSpacing, true)
    })

    it("maps bracketSpacing.bracketSpacing=off → bracketSpacing: false", () => {
        const json = JSON.parse(getPrettierConfig({bracketSpacing: {bracketSpacing: "off"}}))
        assert.equal(json.bracketSpacing, false)
    })

    it("maps trailingComma.trailingComma=on → trailingComma: all, off → none", () => {
        assert.equal(JSON.parse(getPrettierConfig({trailingComma: {trailingComma: "on"}})).trailingComma, "all")
        assert.equal(JSON.parse(getPrettierConfig({trailingComma: {trailingComma: "off"}})).trailingComma, "none")
    })
})

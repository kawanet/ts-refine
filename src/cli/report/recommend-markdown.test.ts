import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {writeFormatMarkdown, writePrettierMarkdown, writeStylisticMarkdown} from "./recommend-markdown.ts"

describe("writeFormatMarkdown", () => {
    function captureMd(report: TSR.ReportResult): string {
        let out = ""
        writeFormatMarkdown(report, {write: (s) => (out += s)})
        return out
    }

    it("wraps the command in a `## recommendation` fenced block", () => {
        const out = captureMd({semi: {semi: "off"}, indent: {width: 4}})
        assert.match(out, /^## recommendation\n\n```sh\nts-refine format \\\n/)
        assert.match(out, /\n {2}--semi off --indent 4\n```\n\n$/)
    })

    it("emits nothing when no recommendations fired (no empty ## recommendation block)", () => {
        const out = captureMd({})
        assert.equal(out, "")
    })
})

describe("writePrettierMarkdown", () => {
    function captureMd(report: TSR.ReportResult): string {
        let out = ""
        writePrettierMarkdown(report, {write: (s) => (out += s)})
        return out
    }

    it("wraps the JSON in a `### .prettierrc` fenced block ending in a trailing blank line", () => {
        const out = captureMd({semi: {semi: "off"}, indent: {width: 4}})

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

describe("writeStylisticMarkdown", () => {
    function captureMd(report: TSR.ReportResult): string {
        let out = ""
        writeStylisticMarkdown(report, {write: (s) => (out += s)})
        return out
    }

    it("wraps the JSON in a stylistic fenced block ending in a trailing blank line", () => {
        const out = captureMd({semi: {semi: "off"}, indent: {width: 4}})

        assert.match(out, /^### @stylistic\/eslint-plugin\n\n```json\n/)
        assert.match(out, /\n```\n\n$/)
        const jsonBody = out.match(/```json\n([\s\S]*?)\n```/)?.[1]
        assert.ok(jsonBody)
        const parsed = JSON.parse(jsonBody!)
        assert.deepEqual(parsed.rules["@stylistic/semi"], ["error", "never"])
        assert.deepEqual(parsed.rules["@stylistic/indent"], ["error", 4])
    })

    it("emits nothing when no recommendations fired", () => {
        assert.equal(captureMd({}), "")
    })
})

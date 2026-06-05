import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getStylisticConfig, writeStylisticMarkdown} from "./emit-stylistic.ts"

function capture(report: Parameters<typeof getStylisticConfig>[0]): string {
    return getStylisticConfig(report)
}

describe("getStylisticConfig", () => {
    it("renders an empty rules object when nothing was recommended", () => {
        assert.deepEqual(JSON.parse(capture({})), {rules: {}})
    })

    it("maps format reports to @stylistic rule entries", () => {
        const json = JSON.parse(
            capture({
                semi: {semi: "on"},
                indent: {width: 4},
                memberDelimiter: {delimiter: "semi"},
                newLine: {newLine: "lf"},
                bracketSpacing: {bracketSpacing: "off"},
                trailingComma: {trailingComma: "on"},
            }),
        )

        assert.deepEqual(json.rules["@stylistic/semi"], ["error", "always"])
        assert.deepEqual(json.rules["@stylistic/indent"], ["error", 4])
        assert.deepEqual(json.rules["@stylistic/linebreak-style"], ["error", "unix"])
        assert.deepEqual(json.rules["@stylistic/object-curly-spacing"], ["error", "never"])
        assert.deepEqual(json.rules["@stylistic/comma-dangle"], ["error", "always-multiline"])
        assert.deepEqual(json.rules["@stylistic/member-delimiter-style"], [
            "error",
            {
                multiline: {delimiter: "semi", requireLast: true},
                singleline: {delimiter: "semi", requireLast: true},
            },
        ])
    })

    it("maps on/off and tab variants", () => {
        const json = JSON.parse(capture({semi: {semi: "on"}, indent: {width: "tab"}, newLine: {newLine: "crlf"}, bracketSpacing: {bracketSpacing: "on"}, trailingComma: {trailingComma: "off"}}))
        assert.deepEqual(json.rules["@stylistic/semi"], ["error", "always"])
        assert.deepEqual(json.rules["@stylistic/indent"], ["error", "tab"])
        assert.deepEqual(json.rules["@stylistic/linebreak-style"], ["error", "windows"])
        assert.deepEqual(json.rules["@stylistic/object-curly-spacing"], ["error", "always"])
        assert.deepEqual(json.rules["@stylistic/comma-dangle"], ["error", "never"])
    })

    it("skips CR-only new-line reports because stylistic has no equivalent", () => {
        const json = JSON.parse(capture({newLine: {newLine: "cr"}}))
        assert.deepEqual(json.rules, {})
    })

    it("uses a legal singleline delimiter when member delimiter is none", () => {
        const json = JSON.parse(capture({memberDelimiter: {delimiter: "none"}}))
        assert.deepEqual(json.rules["@stylistic/member-delimiter-style"], [
            "error",
            {
                multiline: {delimiter: "none", requireLast: true},
                singleline: {delimiter: "semi", requireLast: false},
            },
        ])
    })

    it("skips semi when member delimiter semicolons should be preserved with statement semis off", () => {
        const json = JSON.parse(capture({semi: {semi: "off"}, memberDelimiter: {delimiter: "semi"}}))
        assert.equal(json.rules["@stylistic/semi"], undefined)
        assert.equal(json.rules["@stylistic/member-delimiter-style"][1].singleline.delimiter, "semi")
    })

    it("skips semi when member delimiters should be absent with statement semis on", () => {
        const json = JSON.parse(capture({semi: {semi: "on"}, memberDelimiter: {delimiter: "none"}}))
        assert.equal(json.rules["@stylistic/semi"], undefined)
        assert.equal(json.rules["@stylistic/member-delimiter-style"][1].multiline.delimiter, "none")
    })

    it("skips semi when comma member delimiters cannot describe class fields", () => {
        const json = JSON.parse(capture({semi: {semi: "off"}, memberDelimiter: {delimiter: "comma"}}))
        assert.equal(json.rules["@stylistic/semi"], undefined)
        assert.equal(json.rules["@stylistic/member-delimiter-style"][1].multiline.delimiter, "comma")
    })

    it("keeps rule arrays compact in the JSON output", () => {
        const out = capture({semi: {semi: "off"}, indent: {width: 2}})
        assert.match(out, /"@stylistic\/semi": \["error", "never"\]/)
        assert.match(out, /"@stylistic\/indent": \["error", 2\]/)
    })
})

describe("writeStylisticMarkdown", () => {
    function captureMd(report: Parameters<typeof writeStylisticMarkdown>[0]): string {
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

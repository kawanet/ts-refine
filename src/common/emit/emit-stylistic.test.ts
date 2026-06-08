import type {RuleOptions} from "@stylistic/eslint-plugin"
import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "../../../types/ts-refine"
import {getStylisticConfig} from "./emit-stylistic.ts"

type StylisticRules = {
    [K in keyof RuleOptions]?: any[]
}

function capture(report: TSR.ReportResult): {rules: StylisticRules} {
    return JSON.parse(getStylisticConfig(report))
}

describe("getStylisticConfig", () => {
    it("renders an empty rules object when nothing was recommended", () => {
        assert.deepEqual(capture({}), {rules: {}})
    })

    it("maps format reports to @stylistic rule entries", () => {
        const json = capture({
            semi: {semi: "on"},
            indent: {width: 4},
            memberDelimiter: {delimiter: "semi"},
            newLine: {newLine: "lf"},
            bracketSpacing: {bracketSpacing: "off"},
            trailingComma: {trailingComma: "on"},
        })

        assert.ok(json.rules)
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
        const json = capture({
            semi: {semi: "on"},
            indent: {width: "tab"},
            newLine: {newLine: "crlf"},
            bracketSpacing: {bracketSpacing: "on"},
            trailingComma: {trailingComma: "off"},
        })

        assert.ok(json.rules)
        assert.deepEqual(json.rules["@stylistic/semi"], ["error", "always"])
        assert.deepEqual(json.rules["@stylistic/indent"], ["error", "tab"])
        assert.deepEqual(json.rules["@stylistic/linebreak-style"], ["error", "windows"])
        assert.deepEqual(json.rules["@stylistic/object-curly-spacing"], ["error", "always"])
        assert.deepEqual(json.rules["@stylistic/comma-dangle"], ["error", "never"])
    })

    it("uses a legal singleline delimiter when member delimiter is none", () => {
        const json = capture({memberDelimiter: {delimiter: "none"}})

        assert.ok(json.rules)
        assert.deepEqual(json.rules["@stylistic/member-delimiter-style"], [
            "error",
            {
                multiline: {delimiter: "none", requireLast: true},
                singleline: {delimiter: "semi", requireLast: false},
            },
        ])
    })

    it("skips semi when member delimiter semicolons should be preserved with statement semis off", () => {
        const json = capture({semi: {semi: "off"}, memberDelimiter: {delimiter: "semi"}})
        assert.ok(json.rules)

        assert.equal(json.rules["@stylistic/semi"], undefined)
        assert.equal(json.rules["@stylistic/member-delimiter-style"]?.[1].singleline.delimiter, "semi")
    })

    it("skips semi when member delimiters should be absent with statement semis on", () => {
        const json = capture({semi: {semi: "on"}, memberDelimiter: {delimiter: "none"}})
        assert.ok(json.rules)

        assert.equal(json.rules["@stylistic/semi"], undefined)
        assert.equal(json.rules["@stylistic/member-delimiter-style"]?.[1].multiline.delimiter, "none")
    })

    it("skips semi when comma member delimiters cannot describe class fields", () => {
        const json = capture({semi: {semi: "off"}, memberDelimiter: {delimiter: "comma"}})
        assert.ok(json.rules)

        assert.equal(json.rules["@stylistic/semi"], undefined)
        assert.equal(json.rules["@stylistic/member-delimiter-style"]?.[1].multiline.delimiter, "comma")
    })

    it("ignores anonymous function spacing when function axes disagree", () => {
        const json = capture({functionSpacing: {functionKeywordSpacing: "on", functionParenSpacing: "off", controlKeywordSpacing: "on"}})
        assert.ok(json.rules)
        assert.deepEqual(json.rules["@stylistic/space-before-function-paren"], [
            "error",
            {
                anonymous: "ignore",
                named: "never",
                asyncArrow: "ignore",
            },
        ])
        assert.equal(json.rules["@stylistic/keyword-spacing"], undefined)
    })

    it("emits anonymous function spacing when function axes agree or only one side is known", () => {
        assert.deepEqual(capture({functionSpacing: {functionKeywordSpacing: "on", functionParenSpacing: "on"}}).rules["@stylistic/space-before-function-paren"], [
            "error",
            {anonymous: "always", named: "always", asyncArrow: "ignore"},
        ])
        assert.deepEqual(capture({functionSpacing: {functionParenSpacing: "off"}}).rules["@stylistic/space-before-function-paren"], [
            "error",
            {anonymous: "never", named: "never", asyncArrow: "ignore"},
        ])
        assert.deepEqual(capture({functionSpacing: {functionKeywordSpacing: "on"}}).rules["@stylistic/space-before-function-paren"], [
            "error",
            {anonymous: "always", named: "ignore", asyncArrow: "ignore"},
        ])
    })

    it("keeps rule arrays compact in the JSON output", () => {
        const out = getStylisticConfig({semi: {semi: "off"}, indent: {width: 2}})
        assert.match(out, /"@stylistic\/semi": \["error", "never"\]/)
        assert.match(out, /"@stylistic\/indent": \["error", 2\]/)
    })
})

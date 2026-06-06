import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {selectEmitter} from "./select-emitter.ts"

describe("selectOutput", () => {
    it("returns undefined when no output is selected", () => {
        const f = selectEmitter(undefined)
        assert.equal(f, undefined)
    })

    it("leaves the report stream unset and writes prettier JSON on finalize", () => {
        const f = selectEmitter("prettier")
        assert.ok(f)
        const config = f({semi: {semi: "off"}, indent: {width: 4}})

        const json = config && JSON.parse(config)
        assert.equal(json.semi, false)
        assert.equal(json.tabWidth, 4)
        assert.equal(json.useTabs, false)
    })

    it("leaves the report stream unset and writes the format command on finalize", () => {
        const f = selectEmitter("ts-refine")
        assert.ok(f)
        const config = f({semi: {semi: "off"}, indent: {width: 4}, memberDelimiter: {delimiter: "comma"}})

        // Single-line form: just the `format` flags (no leading `ts-refine format`),
        // suitable for embedding (e.g. in headings) or passing to `ts-refine format`.
        assert.equal(config, "--semi off --indent 4 --member-delimiter comma")
    })

    it("leaves the report stream unset and writes stylistic JSON on finalize", () => {
        const f = selectEmitter("stylistic")
        assert.ok(f)
        const config = f({semi: {semi: "off"}, indent: {width: 4}})

        const json = config && JSON.parse(config)
        assert.deepEqual(json.rules["@stylistic/semi"], ["error", "never"])
        assert.deepEqual(json.rules["@stylistic/indent"], ["error", 4])
    })

    it("throws on an unknown output name", () => {
        assert.throws(() => selectEmitter("typo-format"), /unknown --emit: typo-format \(known: ts-refine, prettier, stylistic\)/)
    })
})

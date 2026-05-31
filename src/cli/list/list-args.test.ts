import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../args-common.ts"
import {parseList} from "./list-args.ts"

function common(): CommonArgs {
    return {tsconfigPath: null, dryRun: false}
}

// Silences the expected stderr writes so the test output stays clean.
function quiet<T>(fn: () => T): T {
    const orig = console.error
    console.error = () => {}
    try {
        return fn()
    } finally {
        console.error = orig
    }
}

describe("parseList", () => {
    it("parses with no filters", () => {
        const r = parseList([], common())
        assert.ok(r)
        assert.deepEqual(r.listFilters, {noExports: false, noImporters: false, unusedExports: false})
    })

    it("parses the filter flags", () => {
        const r = parseList(["--no-exports", "--unused-exports"], common())
        assert.ok(r)
        assert.deepEqual(r.listFilters, {noExports: true, noImporters: false, unusedExports: true})
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseList(["a.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts"])
    })

    it("rejects --dry-run as a read command", () => {
        assert.equal(
            quiet(() => parseList(["--dry-run"], common())),
            undefined,
        )
    })

    it("returns undefined on an unknown option", () => {
        assert.equal(
            quiet(() => parseList(["--bogus"], common())),
            undefined,
        )
    })
})

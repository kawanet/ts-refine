import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../args-common.ts"
import {parseInspect} from "./inspect-args.ts"

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

describe("parseInspect", () => {
    it("defaults to the full inspector registry", () => {
        const r = parseInspect([], common())
        assert.ok(r)
        assert.deepEqual(r.inspectorNames, ["exports", "importers"])
    })

    it("collects inspector selectors and dedupes", () => {
        const r = parseInspect(["--exports", "--importers", "--exports"], common())
        assert.ok(r)
        assert.deepEqual(r.inspectorNames, ["exports", "importers"])
    })

    it("passes unknown inspector selectors through (refineInspect validates)", () => {
        const r = parseInspect(["--typo"], common())
        assert.ok(r)
        assert.deepEqual(r.inspectorNames, ["typo"])
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseInspect(["a.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts"])
    })

    it("rejects --dry-run as a read command", () => {
        assert.equal(
            quiet(() => parseInspect(["--dry-run"], common())),
            undefined,
        )
    })
})

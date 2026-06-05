import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseInspectArgs} from "./parse-inspect-args.ts"

function common(): CommonArgs {
    return {tsconfigPath: null, dryRun: false, help: false}
}

describe("parseInspect", () => {
    it("defaults to the full inspector registry", () => {
        const r = parseInspectArgs([], common())
        assert.ok(r)
        assert.deepEqual(r.inspectors, ["exports", "importers"])
    })

    it("collects inspector selectors and dedupes", () => {
        const r = parseInspectArgs(["--exports", "--importers", "--exports"], common())
        assert.ok(r)
        assert.deepEqual(r.inspectors, ["exports", "importers"])
    })

    it("passes unknown inspector selectors through (refineInspect validates)", () => {
        const r = parseInspectArgs(["--typo"], common())
        assert.ok(r)
        assert.deepEqual(r.inspectors, ["typo"])
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseInspectArgs(["a.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts"])
    })

    it("rejects --dry-run as a read command", () => {
        assert.throws(() => parseInspectArgs(["--dry-run"], common()), /--dry-run is not valid/)
    })
})

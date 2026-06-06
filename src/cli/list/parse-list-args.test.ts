import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseListArgs} from "./parse-list-args.ts"

function common(): CommonArgs {
    return {}
}

describe("parseList", () => {
    it("parses with no filters", () => {
        const r = parseListArgs([], common())
        assert.ok(r)
        assert.deepEqual(r.listFilters, {noExports: false, noImporters: false, unusedExports: false})
    })

    it("parses the filter flags", () => {
        const r = parseListArgs(["--no-exports", "--unused-exports"], common())
        assert.ok(r)
        assert.deepEqual(r.listFilters, {noExports: true, noImporters: false, unusedExports: true})
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseListArgs(["a.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts"])
    })

    it("reads the --ref target into the filters", () => {
        const r = parseListArgs(["--ref", "nsA.funcB"], common())
        assert.ok(r)
        assert.equal(r.listFilters.ref, "nsA.funcB")
    })

    it("throws when --ref has no target", () => {
        assert.throws(() => parseListArgs(["--ref"], common()), /--ref requires a <target>/)
        assert.throws(() => parseListArgs(["--ref", "--no-exports"], common()), /--ref requires a <target>/)
    })

    it("rejects --dry-run as a read command", () => {
        assert.throws(() => parseListArgs(["--dry-run"], common()), /--dry-run is not valid/)
    })

    it("throws on an unknown option", () => {
        assert.throws(() => parseListArgs(["--bogus"], common()), /unknown option/)
    })
})

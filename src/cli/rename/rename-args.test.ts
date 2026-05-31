import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../args-common.ts"
import {parseRename} from "./rename-args.ts"

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

describe("parseRename", () => {
    it("parses --from / --to with no scope file", () => {
        const r = parseRename(["--from", "funcA", "--to", "funcB"], common())
        assert.ok(r)
        assert.equal(r.from, "funcA")
        assert.equal(r.to, "funcB")
        assert.deepEqual(r.paths, [])
    })

    it("keeps the scope file raw for the runner to resolve", () => {
        const r = parseRename(["libs.ts", "--from", "funcA", "--to", "funcB"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["libs.ts"])
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseRename(["--from", "funcA", "--to", "funcB", "--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("errors when --to is missing", () => {
        assert.equal(
            quiet(() => parseRename(["--from", "funcA"], common())),
            undefined,
        )
    })

    it("errors when more than one file is given", () => {
        assert.equal(
            quiet(() => parseRename(["a.ts", "b.ts", "--from", "funcA", "--to", "funcB"], common())),
            undefined,
        )
    })
})

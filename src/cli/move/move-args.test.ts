import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../args-common.ts"
import {parseMove} from "./move-args.ts"

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

describe("parseMove", () => {
    it("keeps positionals raw as a flat list (resolve + split happen in the runner)", () => {
        const r = parseMove(["a.ts", "b.ts", "dest/"], common())
        assert.ok(r)
        // Trailing `/` is preserved verbatim so the runner can detect a directory dest.
        assert.deepEqual(r.paths, ["a.ts", "b.ts", "dest/"])
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseMove(["a.ts", "dest", "--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("rejects fewer than two positionals", () => {
        assert.equal(
            quiet(() => parseMove(["only-one.ts"], common())),
            undefined,
        )
    })
})

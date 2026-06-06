import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseMoveArgs} from "./parse-move-args.ts"

function common(): CommonArgs {
    return {}
}

describe("parseMove", () => {
    it("keeps positionals raw as a flat list (resolve + split happen in the runner)", () => {
        const r = parseMoveArgs(["a.ts", "b.ts", "dest/"], common())
        assert.ok(r)

        // Trailing `/` is preserved verbatim so the runner can detect a directory dest.
        assert.deepEqual(r.paths, ["a.ts", "b.ts", "dest/"])
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseMoveArgs(["a.ts", "dest", "--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("rejects fewer than two positionals", () => {
        assert.throws(() => parseMoveArgs(["only-one.ts"], common()), /move requires/)
    })
})

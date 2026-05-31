import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseRenameArgs} from "./parse-rename-args.ts"

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
        const r = parseRenameArgs(["--from", "funcA", "--to", "funcB"], common())
        assert.ok(r)
        assert.equal(r.from, "funcA")
        assert.equal(r.to, "funcB")
        assert.deepEqual(r.paths, [])
    })

    it("keeps the scope file raw for the runner to resolve", () => {
        const r = parseRenameArgs(["libs.ts", "--from", "funcA", "--to", "funcB"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["libs.ts"])
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseRenameArgs(["--from", "funcA", "--to", "funcB", "--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("errors when --to is missing", () => {
        assert.equal(
            quiet(() => parseRenameArgs(["--from", "funcA"], common())),
            undefined,
        )
    })

    it("errors when more than one file is given", () => {
        assert.equal(
            quiet(() => parseRenameArgs(["a.ts", "b.ts", "--from", "funcA", "--to", "funcB"], common())),
            undefined,
        )
    })
})

// parseCommonArgs consumes the position-independent globals one option at a
// time. Either-side behavior and dispatch are covered end-to-end in
// refine-cli.test.ts; per-command option parsing lives in the
// <command>-args.test.ts files.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {type CommonArgs, parseCommonArgs} from "./args-common.ts"

function fresh(): CommonArgs {
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

describe("parseCommonArgs", () => {
    it("consumes -p <path> into tsconfigPath and reports two tokens", () => {
        const c = fresh()
        assert.equal(parseCommonArgs(c, ["-p", "tsconfig.json"], 0), 2)
        assert.equal(c.tsconfigPath, "tsconfig.json")
    })

    it("accepts --project as the long form of -p", () => {
        const c = fresh()
        assert.equal(parseCommonArgs(c, ["--project", "x.json"], 0), 2)
        assert.equal(c.tsconfigPath, "x.json")
    })

    it("consumes --dry-run into dryRun and reports one token", () => {
        const c = fresh()
        assert.equal(parseCommonArgs(c, ["--dry-run"], 0), 1)
        assert.equal(c.dryRun, true)
    })

    it("reports zero for a token that is not a global", () => {
        const c = fresh()
        assert.equal(parseCommonArgs(c, ["report"], 0), 0)
        assert.equal(parseCommonArgs(c, ["--semicolons"], 0), 0)
    })

    it("reads at the given index, not just the front", () => {
        const c = fresh()
        assert.equal(parseCommonArgs(c, ["report", "-p", "x.json"], 1), 2)
        assert.equal(c.tsconfigPath, "x.json")
    })

    it("rejects -p without a value (-1)", () => {
        assert.equal(
            quiet(() => parseCommonArgs(fresh(), ["-p"], 0)),
            -1,
        )
        assert.equal(
            quiet(() => parseCommonArgs(fresh(), ["-p", "--dry-run"], 0)),
            -1,
        )
    })

    it("rejects a duplicate -p, even across separate calls (-1)", () => {
        const c = fresh()
        parseCommonArgs(c, ["-p", "a.json"], 0)
        assert.equal(
            quiet(() => parseCommonArgs(c, ["-p", "b.json"], 0)),
            -1,
        )
    })
})

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseImportsArgs} from "./parse-imports-args.ts"

function common(): CommonArgs {
    return {tsconfigPath: null, dryRun: false, help: false}
}

describe("parseImports", () => {
    it("defaults to no positionals (whole project)", () => {
        const r = parseImportsArgs([], common())
        assert.ok(r)
        assert.deepEqual(r.paths, [])
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseImportsArgs(["a.ts", "b.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts", "b.ts"])
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseImportsArgs(["--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("consumes a trailing -p into the common args", () => {
        const c = common()
        assert.ok(parseImportsArgs(["-p", "tsconfig.json"], c))
        assert.equal(c.tsconfigPath, "tsconfig.json")
    })

    it("rejects style override flags (organizing is style-preserving)", () => {
        assert.throws(() => parseImportsArgs(["--semicolons", "off"], common()), /unknown option/)
    })

    it("throws on an unknown option", () => {
        assert.throws(() => parseImportsArgs(["--definitely-not-a-flag"], common()), /unknown option/)
    })
})

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseImportsArgs} from "./parse-imports-args.ts"

function common(): CommonArgs {
    return {}
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

    it("parses --check as a raw flag, defaulting to false", () => {
        assert.equal(parseImportsArgs([], common())?.check, false)
        assert.equal(parseImportsArgs(["--check"], common())?.check, true)
    })

    it("does not force dry-run in the parser (the runner derives it from --check)", () => {
        // The parser stays side-effect free: --check must not flip common.dryRun.
        const c = common()
        parseImportsArgs(["--check"], c)
        assert.equal(!!c.dryRun, false)
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
        assert.throws(() => parseImportsArgs(["--semi", "off"], common()), /unknown option/)
    })

    it("throws on an unknown option", () => {
        assert.throws(() => parseImportsArgs(["--definitely-not-a-flag"], common()), /unknown option/)
    })
})

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {parseArgs} from "./parse-args.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

// Silence the expected stderr writes so the test output stays clean.
function quiet<T>(fn: () => Promise<T>): Promise<T> {
    const orig = console.error
    console.error = () => {}
    return fn().finally(() => {
        console.error = orig
    })
}

describe("parseArgs", () => {
    it("recognises --organize-imports as a write action", async () => {
        const r = await parseArgs(["--organize-imports", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.organizeImports, true)
        assert.equal(r.removeSemicolons, false)
        assert.equal(r.reportNames.length, 0)
    })

    it("accepts comma-separated --report names with de-duplication", async () => {
        const r = await parseArgs(["--report", "unused-exports,semicolons,unused-exports", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("accepts repeated --report flags", async () => {
        const r = await parseArgs(["--report", "unused-exports", "--report", "semicolons", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("passes unknown report names through without rejecting (runReports validates)", async () => {
        const r = await parseArgs(["--report", "typo-name", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["typo-name"])
    })

    it("resolves include/exclude globs against the tsconfig directory", async () => {
        const r = await parseArgs(["--organize-imports", SAMPLE_TSCONFIG, "--include", "src/**", "--exclude", "**/*.cli.ts"])
        assert.ok(r && !("help" in r))
        const dir = path.dirname(SAMPLE_TSCONFIG)
        assert.equal(r.absIncludes[0], path.join(dir, "src/**"))
        assert.equal(r.absExcludes[0], path.join(dir, "**/*.cli.ts"))
    })

    it("returns {help: true} on --help", async () => {
        assert.deepEqual(await parseArgs(["--help"]), {help: true})
        assert.deepEqual(await parseArgs(["-h"]), {help: true})
    })

    it("returns undefined on empty argv", async () => {
        assert.equal(await parseArgs([]), undefined)
    })

    it("returns undefined on an unknown option", async () => {
        const r = await quiet(() => parseArgs(["--definitely-not-a-flag", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined when both --remove-semicolons and --insert-semicolons are set", async () => {
        const r = await quiet(() => parseArgs(["--remove-semicolons", "--insert-semicolons", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined when action and --report are mixed", async () => {
        const r = await quiet(() => parseArgs(["--organize-imports", "--report", "unused-exports", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })
})

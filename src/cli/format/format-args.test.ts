import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../args-common.ts"
import {parseFormat} from "./format-args.ts"

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

describe("parseFormat", () => {
    it("parses an empty override set with no options", () => {
        const r = parseFormat([], common())
        assert.ok(r)
        assert.deepEqual(r.applyOverrides, {})
        assert.deepEqual(r.paths, [])
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseFormat(["a.ts", "b.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts", "b.ts"])
    })

    it("returns undefined on an unknown option", () => {
        assert.equal(
            quiet(() => parseFormat(["--definitely-not-a-flag"], common())),
            undefined,
        )
    })

    it("rejects --semicolons with an invalid value", () => {
        assert.equal(
            quiet(() => parseFormat(["--semicolons", "yes"], common())),
            undefined,
        )
    })

    it("accepts --semicolons on|off", () => {
        assert.equal(parseFormat(["--semicolons", "on"], common())?.applyOverrides.semicolons, "on")
        assert.equal(parseFormat(["--semicolons", "off"], common())?.applyOverrides.semicolons, "off")
    })

    it("accepts --indent N", () => {
        assert.equal(parseFormat(["--indent", "4"], common())?.applyOverrides.indent, 4)
    })

    it("rejects --indent with a non-positive integer", () => {
        assert.equal(
            quiet(() => parseFormat(["--indent", "0"], common())),
            undefined,
        )
    })

    it("accepts --indent tab for tab indentation", () => {
        assert.equal(parseFormat(["--indent", "tab"], common())?.applyOverrides.indent, "tab")
    })

    it("accepts --new-line lf and --new-line crlf", () => {
        assert.equal(parseFormat(["--new-line", "lf"], common())?.applyOverrides.newLine, "lf")
        assert.equal(parseFormat(["--new-line", "crlf"], common())?.applyOverrides.newLine, "crlf")
    })

    it("rejects --new-line cr (LS formatter cannot emit CR-only)", () => {
        assert.equal(
            quiet(() => parseFormat(["--new-line", "cr"], common())),
            undefined,
        )
    })

    it("accepts --bracket-spacing on|off", () => {
        assert.equal(parseFormat(["--bracket-spacing", "off"], common())?.applyOverrides.bracketSpacing, "off")
    })

    it("accepts --organize-imports on|off", () => {
        assert.equal(parseFormat(["--organize-imports", "off"], common())?.applyOverrides.organizeImports, "off")
    })

    it("rejects bare --organize-imports without an on|off argument", () => {
        assert.equal(
            quiet(() => parseFormat(["--organize-imports"], common())),
            undefined,
        )
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseFormat(["--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("consumes a trailing -p into the common args", () => {
        const c = common()
        assert.ok(parseFormat(["-p", "tsconfig.json"], c))
        assert.equal(c.tsconfigPath, "tsconfig.json")
    })

    it("treats --output as an unknown option", () => {
        assert.equal(
            quiet(() => parseFormat(["--output", "prettier"], common())),
            undefined,
        )
    })
})

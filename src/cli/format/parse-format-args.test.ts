import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseFormatArgs} from "./parse-format-args.ts"

function common(): CommonArgs {
    return {tsconfigPath: null, dryRun: false, help: false}
}

describe("parseFormat", () => {
    it("parses an empty override set with no options", () => {
        const r = parseFormatArgs([], common())
        assert.ok(r)
        assert.deepEqual(r.applyOverrides, {})
        assert.deepEqual(r.paths, [])
    })

    it("keeps positional files raw for the runner to resolve", () => {
        const r = parseFormatArgs(["a.ts", "b.ts"], common())
        assert.ok(r)
        assert.deepEqual(r.paths, ["a.ts", "b.ts"])
    })

    it("throws on an unknown option", () => {
        assert.throws(() => parseFormatArgs(["--definitely-not-a-flag"], common()), /unknown option/)
    })

    it("parses --check as a raw flag, defaulting to false", () => {
        assert.equal(parseFormatArgs([], common())?.check, false)
        assert.equal(parseFormatArgs(["--check"], common())?.check, true)
    })

    it("does not force dry-run in the parser (the runner derives it from --check)", () => {
        // The parser stays side-effect free: --check must not flip common.dryRun.
        const c = common()
        parseFormatArgs(["--check"], c)
        assert.equal(c.dryRun, false)
    })

    it("rejects --semicolons with an invalid value", () => {
        assert.throws(() => parseFormatArgs(["--semicolons", "yes"], common()), /--semicolons expects/)
    })

    it("accepts --semicolons on|off", () => {
        assert.equal(parseFormatArgs(["--semicolons", "on"], common())?.applyOverrides.semicolons, "on")
        assert.equal(parseFormatArgs(["--semicolons", "off"], common())?.applyOverrides.semicolons, "off")
    })

    it("accepts --indent N", () => {
        assert.equal(parseFormatArgs(["--indent", "4"], common())?.applyOverrides.indent, 4)
    })

    it("rejects --indent with a non-positive integer", () => {
        assert.throws(() => parseFormatArgs(["--indent", "0"], common()), /--indent expects/)
    })

    it("accepts --indent tab for tab indentation", () => {
        assert.equal(parseFormatArgs(["--indent", "tab"], common())?.applyOverrides.indent, "tab")
    })

    it("accepts --new-line lf and --new-line crlf", () => {
        assert.equal(parseFormatArgs(["--new-line", "lf"], common())?.applyOverrides.newLine, "lf")
        assert.equal(parseFormatArgs(["--new-line", "crlf"], common())?.applyOverrides.newLine, "crlf")
    })

    it("rejects --new-line cr (LS formatter cannot emit CR-only)", () => {
        assert.throws(() => parseFormatArgs(["--new-line", "cr"], common()), /--new-line expects/)
    })

    it("accepts --bracket-spacing on|off", () => {
        assert.equal(parseFormatArgs(["--bracket-spacing", "off"], common())?.applyOverrides.bracketSpacing, "off")
    })

    it("rejects --organize-imports with a redirect to the imports command", () => {
        assert.throws(() => parseFormatArgs(["--organize-imports", "only"], common()), /--organize-imports was removed; use `ts-refine imports` instead/)
    })

    it("consumes a trailing --dry-run into the common args", () => {
        const c = common()
        assert.ok(parseFormatArgs(["--dry-run"], c))
        assert.equal(c.dryRun, true)
    })

    it("consumes a trailing -p into the common args", () => {
        const c = common()
        assert.ok(parseFormatArgs(["-p", "tsconfig.json"], c))
        assert.equal(c.tsconfigPath, "tsconfig.json")
    })

    it("treats --emit as an unknown option", () => {
        assert.throws(() => parseFormatArgs(["--emit", "prettier"], common()), /unknown option/)
    })
})

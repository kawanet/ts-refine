import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {parseArgs} from "./parse-args.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

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

describe("parseArgs", () => {
    it("recognises --apply and feeds the recommendation-bearing reports only", () => {
        const r = parseArgs(["--apply", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.apply, true)
        assert.deepEqual(r.applyOverrides, {})
        assert.ok(r.reportNames.includes("semicolons"))
        // Markdown-only extras (unused-exports) are skipped under --apply.
        assert.equal(r.reportNames.includes("unused-exports"), false)
    })

    it("accepts comma-separated --report names with de-duplication", () => {
        const r = parseArgs(["--report", "unused-exports,semicolons,unused-exports", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("accepts repeated --report flags", () => {
        const r = parseArgs(["--report", "unused-exports", "--report", "semicolons", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("passes unknown report names through without rejecting (runReports validates)", () => {
        const r = parseArgs(["--report", "typo-name", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["typo-name"])
    })

    it("passes unknown format names through without rejecting (selectFormat validates)", () => {
        const r = parseArgs(["--format", "typo-format", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.format, "typo-format")
    })

    it("resolves include/exclude globs against the tsconfig directory", () => {
        const r = parseArgs(["--apply", "-p", SAMPLE_TSCONFIG, "--include", "src/**", "--exclude", "**/*.cli.ts"])
        assert.ok(r && !("help" in r))
        const dir = path.dirname(SAMPLE_TSCONFIG)
        assert.equal(r.absIncludes[0], path.join(dir, "src/**"))
        assert.equal(r.absExcludes[0], path.join(dir, "**/*.cli.ts"))
    })

    it("defaults tsconfigPath to ./tsconfig.json when none is given", () => {
        const r = parseArgs(["--apply"])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, path.resolve("tsconfig.json"))
    })

    it("accepts -p with a tsconfig.json path", () => {
        const r = parseArgs(["-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, SAMPLE_TSCONFIG)
    })

    it("accepts --project as the long form of -p", () => {
        const r = parseArgs(["--project", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, SAMPLE_TSCONFIG)
    })

    it("treats a non-.json -p value as a directory and appends tsconfig.json", () => {
        const dir = path.dirname(SAMPLE_TSCONFIG)
        const r = parseArgs(["-p", dir])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, path.join(dir, "tsconfig.json"))
    })

    it("treats `-p .` the same as omitting the path", () => {
        const r = parseArgs(["-p", "."])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, path.resolve("tsconfig.json"))
    })

    it("returns {help: true} on --help", () => {
        assert.deepEqual(parseArgs(["--help"]), {help: true})
        assert.deepEqual(parseArgs(["-h"]), {help: true})
    })

    it("defaults to running every registered report when no flag is given", () => {
        const r = parseArgs([])
        assert.ok(r && !("help" in r))
        // Survey-style default: every report in the registry runs.
        assert.ok(r.reportNames.includes("unused-exports"))
        assert.ok(r.reportNames.includes("semicolons"))
        assert.equal(r.surveyDefault, true)
        assert.equal(r.apply, false)
    })

    it("runs every recommendation-bearing report under --apply, skipping the Markdown-only extras", () => {
        const r = parseArgs(["--apply"])
        assert.ok(r && !("help" in r))
        // surveyDefault gates the recommendation Markdown blocks only.
        assert.equal(r.surveyDefault, false)
        // Recommendation-bearing reports are still active.
        assert.ok(r.reportNames.includes("semicolons"))
        assert.ok(r.reportNames.includes("bracket-spacing"))
        // unused-exports is Markdown-only and perturbs LS state for runApply,
        // so it sits in the extras registry and is skipped here.
        assert.equal(r.reportNames.includes("unused-exports"), false)
    })

    it("treats explicit --report or --format as opting out of the survey-default flag", () => {
        const r1 = parseArgs(["--report", "unused-exports", "-p", SAMPLE_TSCONFIG])
        assert.ok(r1 && !("help" in r1))
        assert.equal(r1.surveyDefault, false)
        const r2 = parseArgs(["--format", "prettier", "-p", SAMPLE_TSCONFIG])
        assert.ok(r2 && !("help" in r2))
        assert.equal(r2.surveyDefault, false)
    })

    it("returns undefined on an unknown option", () => {
        const r = quiet(() => parseArgs(["--definitely-not-a-flag", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("rejects a bare positional argument (use -p instead)", () => {
        const r = quiet(() => parseArgs([SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("rejects --semicolons with an invalid value", () => {
        const r = quiet(() => parseArgs(["--semicolons", "yes", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --semicolons on (implies --apply)", () => {
        const r = parseArgs(["--semicolons", "on", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.apply, true)
        assert.equal(r.applyOverrides.semicolons, "on")
    })

    it("accepts --semicolons off (implies --apply)", () => {
        const r = parseArgs(["--semicolons", "off", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.apply, true)
        assert.equal(r.applyOverrides.semicolons, "off")
    })

    it("accepts --indent N as a apply-mode override (implies --apply)", () => {
        const r = parseArgs(["--indent", "4", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.apply, true)
        assert.equal(r.applyOverrides.indent, 4)
    })

    it("rejects --indent with a non-positive integer", () => {
        const r = quiet(() => parseArgs(["--indent", "0", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --indent tab for tab indentation (implies --apply)", () => {
        const r = parseArgs(["--indent", "tab", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.apply, true)
        assert.equal(r.applyOverrides.indent, "tab")
    })

    it("accepts --new-line lf and --new-line crlf", () => {
        const r1 = parseArgs(["--new-line", "lf", "-p", SAMPLE_TSCONFIG])
        assert.ok(r1 && !("help" in r1))
        assert.equal(r1.applyOverrides.newLine, "lf")
        const r2 = parseArgs(["--new-line", "crlf", "-p", SAMPLE_TSCONFIG])
        assert.ok(r2 && !("help" in r2))
        assert.equal(r2.applyOverrides.newLine, "crlf")
    })

    it("rejects --new-line cr (LS formatter cannot emit CR-only)", () => {
        const r = quiet(() => parseArgs(["--new-line", "cr", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --bracket-spacing on|off", () => {
        const r = parseArgs(["--bracket-spacing", "off", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.applyOverrides.bracketSpacing, "off")
    })

    it("accepts --organize-imports on|off as a apply-mode override (implies --apply)", () => {
        const r = parseArgs(["--organize-imports", "off", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.apply, true)
        assert.equal(r.applyOverrides.organizeImports, "off")
    })

    it("rejects bare --organize-imports without an on|off argument", () => {
        const r = quiet(() => parseArgs(["--organize-imports", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined when apply overrides and --report are mixed", () => {
        const r = quiet(() => parseArgs(["--indent", "4", "--report", "unused-exports", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined when --apply and --format are mixed", () => {
        const r = quiet(() => parseArgs(["--apply", "--format", "prettier", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined when --semicolons (implicit apply) and --format are mixed", () => {
        const r = quiet(() => parseArgs(["--semicolons", "on", "--format", "prettier", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })
})

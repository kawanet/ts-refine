import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {parseArgs} from "./parse-args.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")
const SAMPLE_DIR = path.dirname(SAMPLE_TSCONFIG)

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
    it("treats `reformat` as the write mode and feeds the recommendation-bearing reports only", () => {
        const r = parseArgs(["reformat", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.command, "reformat")
        assert.deepEqual(r.applyOverrides, {})
        assert.ok(r.reportNames.includes("semicolons"))
        // Markdown-only extras (unused-exports) are skipped under `reformat`.
        assert.equal(r.reportNames.includes("unused-exports"), false)
    })

    it("collects report-name selector flags with de-duplication", () => {
        const r = parseArgs(["report", "--unused-exports", "--semicolons", "--unused-exports", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.command, "report")
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("passes unknown report selectors through without rejecting (runReports validates)", () => {
        const r = parseArgs(["report", "--typo-name", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["typo-name"])
    })

    it("passes unknown --output names through without rejecting (selectFormat validates)", () => {
        const r = parseArgs(["report", "--output", "typo-format", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.output, "typo-format")
    })

    it("accepts report selectors alongside --output", () => {
        const r = parseArgs(["report", "--semicolons", "--output", "reformat", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.reportNames, ["semicolons"])
        assert.equal(r.output, "reformat")
        assert.equal(r.surveyDefault, false)
    })

    it("resolves positional file globs against the tsconfig directory", () => {
        const r = parseArgs(["report", "-p", SAMPLE_TSCONFIG, "src/**", "extra.ts"])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.absIncludes, [path.join(SAMPLE_DIR, "src/**"), path.join(SAMPLE_DIR, "extra.ts")])
    })

    it("accepts positional files under reformat", () => {
        const r = parseArgs(["reformat", "-p", SAMPLE_TSCONFIG, "a.ts", "b.ts"])
        assert.ok(r && !("help" in r))
        assert.deepEqual(r.absIncludes, [path.join(SAMPLE_DIR, "a.ts"), path.join(SAMPLE_DIR, "b.ts")])
    })

    it("defaults tsconfigPath to ./tsconfig.json when none is given", () => {
        const r = parseArgs(["reformat"])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, path.resolve("tsconfig.json"))
    })

    it("accepts -p with a tsconfig.json path", () => {
        const r = parseArgs(["report", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, SAMPLE_TSCONFIG)
    })

    it("accepts --project as the long form of -p", () => {
        const r = parseArgs(["report", "--project", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, SAMPLE_TSCONFIG)
    })

    it("treats a non-.json -p value as a directory and appends tsconfig.json", () => {
        const r = parseArgs(["report", "-p", SAMPLE_DIR])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, path.join(SAMPLE_DIR, "tsconfig.json"))
    })

    it("treats `-p .` the same as omitting the path", () => {
        const r = parseArgs(["report", "-p", "."])
        assert.ok(r && !("help" in r))
        assert.equal(r.tsconfigPath, path.resolve("tsconfig.json"))
    })

    it("returns {help: true} on help, -h, --help, and no args", () => {
        assert.deepEqual(parseArgs(["help"]), {help: true})
        assert.deepEqual(parseArgs(["--help"]), {help: true})
        assert.deepEqual(parseArgs(["-h"]), {help: true})
        assert.deepEqual(parseArgs([]), {help: true})
    })

    it("treats -h / --help as help even after a subcommand", () => {
        assert.deepEqual(parseArgs(["report", "--help"]), {help: true})
        assert.deepEqual(parseArgs(["reformat", "-h"]), {help: true})
    })

    it("runs every registered report under a bare `report` (survey default)", () => {
        const r = parseArgs(["report"])
        assert.ok(r && !("help" in r))
        assert.equal(r.command, "report")
        // Survey-style default: every report in the registry runs.
        assert.ok(r.reportNames.includes("unused-exports"))
        assert.ok(r.reportNames.includes("semicolons"))
        assert.equal(r.surveyDefault, true)
    })

    it("runs every recommendation-bearing report under `reformat`, skipping the Markdown-only extras", () => {
        const r = parseArgs(["reformat"])
        assert.ok(r && !("help" in r))
        // surveyDefault gates the recommendation Markdown blocks only.
        assert.equal(r.surveyDefault, false)
        assert.ok(r.reportNames.includes("semicolons"))
        assert.ok(r.reportNames.includes("bracket-spacing"))
        // unused-exports is Markdown-only and perturbs LS state for runReformat,
        // so it sits in the extras registry and is skipped here.
        assert.equal(r.reportNames.includes("unused-exports"), false)
    })

    it("opts out of the survey-default flag when selectors or --output are given", () => {
        const r1 = parseArgs(["report", "--unused-exports", "-p", SAMPLE_TSCONFIG])
        assert.ok(r1 && !("help" in r1))
        assert.equal(r1.surveyDefault, false)
        const r2 = parseArgs(["report", "--output", "prettier", "-p", SAMPLE_TSCONFIG])
        assert.ok(r2 && !("help" in r2))
        assert.equal(r2.surveyDefault, false)
    })

    it("returns undefined on an unknown command", () => {
        const r = quiet(() => parseArgs(["frobnicate", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined on an unknown reformat option", () => {
        const r = quiet(() => parseArgs(["reformat", "--definitely-not-a-flag", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined on a stray single-dash option under report", () => {
        const r = quiet(() => parseArgs(["report", "-z", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("returns undefined when options are given without a subcommand", () => {
        const r = quiet(() => parseArgs(["--output", "prettier", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("rejects --semicolons with an invalid value", () => {
        const r = quiet(() => parseArgs(["reformat", "--semicolons", "yes", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --semicolons on|off under reformat", () => {
        const on = parseArgs(["reformat", "--semicolons", "on", "-p", SAMPLE_TSCONFIG])
        assert.ok(on && !("help" in on))
        assert.equal(on.command, "reformat")
        assert.equal(on.applyOverrides.semicolons, "on")
        const off = parseArgs(["reformat", "--semicolons", "off", "-p", SAMPLE_TSCONFIG])
        assert.ok(off && !("help" in off))
        assert.equal(off.applyOverrides.semicolons, "off")
    })

    it("accepts --indent N under reformat", () => {
        const r = parseArgs(["reformat", "--indent", "4", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.command, "reformat")
        assert.equal(r.applyOverrides.indent, 4)
    })

    it("rejects --indent with a non-positive integer", () => {
        const r = quiet(() => parseArgs(["reformat", "--indent", "0", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --indent tab for tab indentation under reformat", () => {
        const r = parseArgs(["reformat", "--indent", "tab", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.applyOverrides.indent, "tab")
    })

    it("accepts --new-line lf and --new-line crlf", () => {
        const r1 = parseArgs(["reformat", "--new-line", "lf", "-p", SAMPLE_TSCONFIG])
        assert.ok(r1 && !("help" in r1))
        assert.equal(r1.applyOverrides.newLine, "lf")
        const r2 = parseArgs(["reformat", "--new-line", "crlf", "-p", SAMPLE_TSCONFIG])
        assert.ok(r2 && !("help" in r2))
        assert.equal(r2.applyOverrides.newLine, "crlf")
    })

    it("rejects --new-line cr (LS formatter cannot emit CR-only)", () => {
        const r = quiet(() => parseArgs(["reformat", "--new-line", "cr", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --bracket-spacing on|off", () => {
        const r = parseArgs(["reformat", "--bracket-spacing", "off", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.applyOverrides.bracketSpacing, "off")
    })

    it("accepts --organize-imports on|off under reformat", () => {
        const r = parseArgs(["reformat", "--organize-imports", "off", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.command, "reformat")
        assert.equal(r.applyOverrides.organizeImports, "off")
    })

    it("rejects bare --organize-imports without an on|off argument", () => {
        const r = quiet(() => parseArgs(["reformat", "--organize-imports", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })

    it("accepts --dry-run under reformat", () => {
        const r = parseArgs(["reformat", "--dry-run", "-p", SAMPLE_TSCONFIG])
        assert.ok(r && !("help" in r))
        assert.equal(r.dryRun, true)
    })

    it("treats --output as an unknown option under reformat", () => {
        const r = quiet(() => parseArgs(["reformat", "--output", "prettier", "-p", SAMPLE_TSCONFIG]))
        assert.equal(r, undefined)
    })
})

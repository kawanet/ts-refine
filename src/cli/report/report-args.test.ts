import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../args-common.ts"
import {parseReport} from "./report-args.ts"

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

describe("parseReport", () => {
    it("collects report-name selector flags with de-duplication", () => {
        const r = parseReport(["--unused-exports", "--semicolons", "--unused-exports"], common())
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("passes unknown report selectors through without rejecting (refineReport validates)", () => {
        const r = parseReport(["--typo-name"], common())
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["typo-name"])
    })

    it("passes unknown --output names through without rejecting (selectOutput validates)", () => {
        const r = parseReport(["--output", "typo-format"], common())
        assert.ok(r)
        assert.equal(r.output, "typo-format")
    })

    it("accepts report selectors alongside --output", () => {
        const r = parseReport(["--semicolons", "--output", "ts-refine"], common())
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["semicolons"])
        assert.equal(r.output, "ts-refine")
        assert.equal(r.surveyDefault, false)
    })

    it("does not mistake --project for a report selector", () => {
        const c = common()
        const r = parseReport(["--project", "x.json", "--semicolons"], c)
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["semicolons"])
        assert.equal(c.tsconfigPath, "x.json")
    })

    it("runs every registered report under a bare `report` (survey default)", () => {
        const r = parseReport([], common())
        assert.ok(r)
        // Survey-style default: every report in the registry runs.
        assert.ok(r.reportNames.includes("semicolons"))
        assert.ok(r.reportNames.includes("bracket-spacing"))
        assert.equal(r.surveyDefault, true)
    })

    it("opts out of the survey-default flag when selectors or --output are given", () => {
        assert.equal(parseReport(["--unused-exports"], common())?.surveyDefault, false)
        assert.equal(parseReport(["--output", "prettier"], common())?.surveyDefault, false)
    })

    it("rejects --dry-run as a read command", () => {
        assert.equal(
            quiet(() => parseReport(["--dry-run"], common())),
            undefined,
        )
    })

    it("returns undefined on a stray single-dash option", () => {
        assert.equal(
            quiet(() => parseReport(["-z"], common())),
            undefined,
        )
    })
})

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseReportArgs} from "./parse-report-args.ts"

function common(): CommonArgs {
    return {tsconfigPath: null, dryRun: false, help: false}
}

describe("parseReport", () => {
    it("collects report-name selector flags with de-duplication", () => {
        const r = parseReportArgs(["--unused-exports", "--semicolons", "--unused-exports"], common())
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["unused-exports", "semicolons"])
    })

    it("passes unknown report selectors through without rejecting (refineReport validates)", () => {
        const r = parseReportArgs(["--typo-name"], common())
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["typo-name"])
    })

    it("passes unknown --output names through without rejecting (selectOutput validates)", () => {
        const r = parseReportArgs(["--output", "typo-format"], common())
        assert.ok(r)
        assert.equal(r.output, "typo-format")
    })

    it("accepts report selectors alongside --output", () => {
        const r = parseReportArgs(["--semicolons", "--output", "ts-refine"], common())
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["semicolons"])
        assert.equal(r.output, "ts-refine")
        assert.equal(r.surveyDefault, false)
    })

    it("does not mistake --project for a report selector", () => {
        const c = common()
        const r = parseReportArgs(["--project", "x.json", "--semicolons"], c)
        assert.ok(r)
        assert.deepEqual(r.reportNames, ["semicolons"])
        assert.equal(c.tsconfigPath, "x.json")
    })

    it("runs every registered report under a bare `report` (survey default)", () => {
        const r = parseReportArgs([], common())
        assert.ok(r)
        // Survey-style default: every report in the registry runs.
        assert.ok(r.reportNames.includes("semicolons"))
        assert.ok(r.reportNames.includes("bracket-spacing"))
        assert.equal(r.surveyDefault, true)
    })

    it("opts out of the survey-default flag when selectors or --output are given", () => {
        assert.equal(parseReportArgs(["--unused-exports"], common())?.surveyDefault, false)
        assert.equal(parseReportArgs(["--output", "prettier"], common())?.surveyDefault, false)
    })

    it("rejects --dry-run as a read command", () => {
        assert.throws(() => parseReportArgs(["--dry-run"], common()), /--dry-run is not valid/)
    })

    it("throws on a stray single-dash option", () => {
        assert.throws(() => parseReportArgs(["-z"], common()), /unknown option/)
    })
})

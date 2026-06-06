import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {CommonArgs} from "../parse-common-args.ts"
import {parseReportArgs} from "./parse-report-args.ts"

function common(): CommonArgs {
    return {}
}

describe("parseReport", () => {
    it("collects report-name selector flags with de-duplication", () => {
        const r = parseReportArgs(["--unused-exports", "--semi", "--unused-exports"], common())
        assert.ok(r)
        assert.deepEqual(r.reports, ["unused-exports", "semi"])
    })

    it("passes unknown report selectors through without rejecting (refineReport validates)", () => {
        const r = parseReportArgs(["--typo-name"], common())
        assert.ok(r)
        assert.deepEqual(r.reports, ["typo-name"])
    })

    it("passes unknown --emit names through without rejecting (selectEmitter validates)", () => {
        const r = parseReportArgs(["--emit", "typo-format"], common())
        assert.ok(r)
        assert.equal(r.emit, "typo-format")
    })

    it("accepts report selectors alongside --emit", () => {
        const r = parseReportArgs(["--semi", "--emit", "ts-refine"], common())
        assert.ok(r)
        assert.deepEqual(r.reports, ["semi"])
        assert.equal(r.emit, "ts-refine")
    })

    it("does not mistake --project for a report selector", () => {
        const c = common()
        const r = parseReportArgs(["--project", "x.json", "--semi"], c)
        assert.ok(r)
        assert.deepEqual(r.reports, ["semi"])
        assert.equal(c.tsconfigPath, "x.json")
    })

    it("accepts a bare `report` (survey default)", () => {
        const r = parseReportArgs([], common())
        assert.ok(r)
        assert.equal(r.reports?.length || 0, 0)
    })

    it("rejects --dry-run as a read command", () => {
        assert.throws(() => parseReportArgs(["--dry-run"], common()), /--dry-run is not valid/)
    })

    it("throws on a stray single-dash option", () => {
        assert.throws(() => parseReportArgs(["-z"], common()), /unknown option/)
    })
})

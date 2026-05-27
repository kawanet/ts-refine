import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {runReportSemicolons} from "./semicolons.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/semicolons-mixed/tsconfig.json")

describe("runReportSemicolons (sample/semicolons-mixed)", () => {
    it("buckets files by trailing `;` ratio and reports a recommendation", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        const lines: string[] = []
        await runReportSemicolons(project, {stream: {write: (l) => lines.push(l)}, absIncludes: [], absExcludes: []})

        const out = lines.join("")
        assert.match(out, /^### semicolons\n/)
        // The fixture has one all-semi (100%), one no-semi (0%), and one mixed
        // (around 50%). The empty file has no statements and must be excluded.
        assert.match(out, /\| 0% \| 1 \| /)
        assert.match(out, /\| 100% \| 1 \| /)
        assert.match(out, /\| total \| 3 \| recommend: /)
        // Empty file should not appear anywhere.
        assert.equal(/empty\.ts/.test(out), false)
    })
})

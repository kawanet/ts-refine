import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {runReportIndent} from "./indent.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/indents-mixed/tsconfig.json")

describe("runReportIndent (sample/indents-mixed)", () => {
    it("groups files by primary leading width and recommends the file-count majority", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        const lines: string[] = []
        await runReportIndent(project, {stream: {write: (l) => lines.push(l)}, absIncludes: [], absExcludes: []})

        const out = lines.join("")
        assert.match(out, /^### indent\n/)
        // two-space.ts:    {2: 4, 4: 1} → primary = 2 (mode)
        // four-space-a.ts: {4: 4, 8: 1} → primary = 4
        // four-space-b.ts: {4: 4, 8: 1} → primary = 4
        // tab.ts:          {tab: 5}     → primary = tab
        // no-indent.ts: no leading lines → excluded
        assert.match(out, /\| 2 \| 4 \| 1 \| sample\/indents-mixed\/src\/two-space\.ts \|/)
        assert.match(out, /\| 4 \| 8 \| 2 \| /)
        assert.match(out, /\| tab \| 5 \| 1 \| sample\/indents-mixed\/src\/tab\.ts \|/)
        // No bucket 8 — no file has 8 as its primary. Anchored to line
        // start so the "8" inside the 4-bucket's lines column does not
        // accidentally satisfy this check.
        assert.equal(/^\| 8 \|/m.test(out), false)
        assert.match(out, /\| total \| 17 \| 4 \| \|/)
        // Bucket 4 contains 2 files; bucket 2 and bucket tab each contain
        // one. The 4-primary wins on file count.
        assert.match(out, /recommendation:\n {4}--indent 4\n/)
        assert.equal(/no-indent\.ts/.test(out), false)
    })
})

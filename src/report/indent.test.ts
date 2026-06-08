import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {renderSections} from "../common/write-report-sections.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {omitSections} from "../test-utils/omit-sections.ts"
import {runReportIndent} from "./indent.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/indents-mixed/tsconfig.json")
const TAB_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/tab-indent/tsconfig.json")

const log = {write: (): void => undefined}

describe("runReportIndent (sample/indents-mixed)", () => {
    it("groups files by primary leading width and returns the file-count majority", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const ret = await runReportIndent({sourceFiles: selectSourceFiles(project, {paths: []}), log})

        const out = renderSections(ret.sections ?? [])
        assert.match(out, /^### --indent /m)

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
        assert.match(out, /\| total \| 17 \| 4 \| *\|/)

        // Recommendation is no longer inlined in the Markdown.
        assert.equal(/^recommendation:/m.test(out), false)

        // Bucket 4 has 2 files; buckets 2 and tab have 1 each, so width=4 wins.
        assert.deepEqual(omitSections(ret), {width: 4})
        assert.equal(/no-indent\.ts/.test(out), false)
    })

    it("breaks a file-count tie by the higher indent-transition count and emits a recommendation", async () => {
        // detectIndent counts transitions (entry / exit), not absolute lines.
        // four-step file has more nested blocks → more transitions at width 4.
        const project = initInMemoryProject()
        project.createSourceFile("/sample/two.ts", "function f() {\n  return 1\n}\n")
        project.createSourceFile("/sample/four.ts", "function g() {\n    if (a) {\n        b()\n    }\n}\n")
        const ret = await runReportIndent({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})
        const out = renderSections(ret.sections ?? [])
        assert.deepEqual(omitSections(ret), {width: 4})

        // No tab-indented file, but the tab row is still emitted at 0.
        assert.match(out, /\| tab \| 0 \| 0 \| *\|/)
    })

    it("returns an empty partial when files AND transition counts tie", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("/sample/two.ts", "function f() {\n  return 1\n}\n")
        project.createSourceFile("/sample/four.ts", "function g() {\n    return 1\n}\n")
        const ret = await runReportIndent({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})
        assert.deepEqual(omitSections(ret), {})
    })
})

describe("runReportIndent (sample/tab-indent)", () => {
    it("recommends width=tab when all files use tab indentation", async () => {
        // Tab is actionable (LS convertTabsToSpaces:false / Prettier
        // useTabs), so the recommendation returns {width: "tab"} and the
        // formatters emit `--indent tab` / `useTabs: true`.
        const project = initTestProject(TAB_TSCONFIG)
        const ret = await runReportIndent({sourceFiles: selectSourceFiles(project, {paths: []}), log})

        const out = renderSections(ret.sections ?? [])
        assert.match(out, /\| tab \| \d+ \| 3 \| /)
        assert.deepEqual(omitSections(ret), {width: "tab"})
    })
})

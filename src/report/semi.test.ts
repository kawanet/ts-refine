import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {renderSections} from "../common/write-report-sections.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {omitSections} from "../test-utils/omit-sections.ts"
import {runReportSemi} from "./semi.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/semicolons-mixed/tsconfig.json")

const log = {write: (): void => undefined}

describe("runReportSemi (sample/semicolons-mixed)", () => {
    it("buckets files by trailing `;` ratio and returns the action params", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: []}), log})

        const out = renderSections(ret.sections ?? [])
        assert.match(out, /^### --semi /)

        // The fixture has one all-semi (100%), one no-semi (0%), and one mixed
        // (around 50%). The empty file has no statements and must be excluded.
        // Columns are now `label | lines | files | example`.
        assert.match(out, /\| 0% \| \d+ \| 1 \| /)
        assert.match(out, /\| 100% \| \d+ \| 1 \| /)
        assert.match(out, /\| total \| \d+ \| 3 \| *\|/)

        // Empty file should not appear anywhere.
        assert.equal(/empty\.ts/.test(out), false)

        // Recommendation is no longer inlined in the Markdown.
        assert.equal(/^recommendation:/m.test(out), false)
        if (Object.keys(ret).length > 0) assert.ok(ret.semi === "on" || ret.semi === "off")
    })

    it("uses integer bucket boundaries for exact 50% and near-boundary tails", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("/sample/tsconfig.json", JSON.stringify({compilerOptions: {}, include: ["*.ts"]}))
        project.createSourceFile("/sample/ten-percent.ts", statements(1, 10))
        project.createSourceFile("/sample/exact-half.ts", statements(1, 2))
        project.createSourceFile("/sample/ninety-percent.ts", statements(9, 10))

        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})

        const out = renderSections(ret.sections ?? [])
        assert.match(out, /\| 1-10% \| 10 \| 1 \| /)
        assert.match(out, /\| 50% \| 2 \| 1 \| /)
        assert.match(out, /\| 90-99% \| 10 \| 1 \| /)
    })

    it("breaks a file-count tie by total statement count and emits a recommendation", async () => {
        // 1 below file with 10 statements vs 1 above file with 3.
        // Files tie at 1 each → statement counts (10 vs 3) decide → "off".
        const project = initInMemoryProject()
        project.createSourceFile("/sample/no-semi.ts", statements(0, 10))
        project.createSourceFile("/sample/all-semi.ts", statements(3, 3))
        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})
        assert.deepEqual(omitSections(ret), {semi: "off"})
    })

    it("returns an empty partial when files AND statements tie on both sides", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("/sample/no-semi.ts", statements(0, 5))
        project.createSourceFile("/sample/all-semi.ts", statements(5, 5))
        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})
        assert.deepEqual(omitSections(ret), {})
    })

    it("counts interface/type members the LS rewrites and skips comma-separated ones", async () => {
        // Two `;` members + one none member are in the LS rewrite domain (3
        // counted); the comma member is excluded. No statements at all, so the
        // file is entirely member-driven: 2/3 carry `;` → bucket 51-89%.
        const project = initInMemoryProject()
        project.createSourceFile("/sample/iface.ts", ["interface A {", "  a: string;", "  b: number;", "  c: boolean", "  d(): void,", "}"].join("\n"))
        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})
        const out = renderSections(ret.sections ?? [])

        // 3 members counted (comma member excluded), 2 with `;`.
        assert.match(out, /\| total \| 3 \| 1 \| *\|/)
        assert.deepEqual(omitSections(ret), {semi: "on"})
    })

    it("does not count grammar-required do-while semicolons", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("/sample/do-while.ts", ["let x = 0", "do {", "  x++", "} while (x < 2);"].join("\n"))

        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: ["/sample/*.ts"]}), log})

        const out = renderSections(ret.sections ?? [])
        assert.match(out, /\| 0% \| \d+ \| 1 \| /)
        assert.match(out, /\| total \| \d+ \| 1 \| *\|/)
    })

    it("with importsOnly, weighs only import/export statement semicolons", async () => {
        const project = initInMemoryProject()

        // The import line carries a `;`; the body statements do not. Whole-file
        // would lean "off" (1 of 3 with `;`); importsOnly sees only the import,
        // which is 100% — so the recommendation flips to "on".
        project.createSourceFile("a.ts", ['import {a} from "./x.ts";', "const _ = a", "const b = 2", ""].join("\n"))
        const ret = await runReportSemi({sourceFiles: selectSourceFiles(project, {paths: []}), log, importsOnly: true})
        assert.deepEqual(omitSections(ret), {semi: "on"})
    })
})

function statements(withSemi: number, total: number): string {
    return Array.from({length: total}, (_, i) => `const v${i} = ${i}${i < withSemi ? ";" : ""}`).join("\n")
}

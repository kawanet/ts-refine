import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {runReportSemicolons} from "./semicolons.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/semicolons-mixed/tsconfig.json")

describe("runReportSemicolons (sample/semicolons-mixed)", () => {
    it("buckets files by trailing `;` ratio and returns the action params", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        const lines: string[] = []
        const ret = await runReportSemicolons(project, {stream: {write: (l) => lines.push(l)}, absIncludes: [], absExcludes: []})

        const out = lines.join("")
        assert.match(out, /^### semicolons\n/)
        // The fixture has one all-semi (100%), one no-semi (0%), and one mixed
        // (around 50%). The empty file has no statements and must be excluded.
        assert.match(out, /\| 0% \| 1 \| /)
        assert.match(out, /\| 100% \| 1 \| /)
        assert.match(out, /\| total \| 3 \| \|/)
        // Empty file should not appear anywhere.
        assert.equal(/empty\.ts/.test(out), false)
        // Recommendation is no longer inlined in the Markdown; it comes back
        // as the return value (Partial<RunSemicolonsOpts>). A tied fixture
        // returns an empty partial.
        assert.equal(/^recommendation:/m.test(out), false)
        if (Object.keys(ret).length > 0) assert.ok(ret.semicolons === "on" || ret.semicolons === "off")
    })

    it("uses integer bucket boundaries for exact 50% and near-boundary tails", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile(
            "/sample/tsconfig.json",
            JSON.stringify({compilerOptions: {}, include: ["*.ts"]}),
        )
        project.createSourceFile("/sample/ten-percent.ts", statements(1, 10))
        project.createSourceFile("/sample/exact-half.ts", statements(1, 2))
        project.createSourceFile("/sample/ninety-percent.ts", statements(9, 10))
        const lines: string[] = []

        await runReportSemicolons(project, {
            stream: {write: (l) => lines.push(l)},
            absIncludes: ["/sample/*.ts"],
            absExcludes: [],
        })

        const out = lines.join("")
        assert.match(out, /\| 1-10% \| 1 \| /)
        assert.match(out, /\| 50% \| 1 \| /)
        assert.match(out, /\| 90-99% \| 1 \| /)
    })

    it("does not count grammar-required do-while semicolons", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("/sample/do-while.ts", ["let x = 0", "do {", "  x++", "} while (x < 2);"].join("\n"))
        const lines: string[] = []

        await runReportSemicolons(project, {
            stream: {write: (l) => lines.push(l)},
            absIncludes: ["/sample/*.ts"],
            absExcludes: [],
        })

        const out = lines.join("")
        assert.match(out, /\| 0% \| 1 \| /)
        assert.match(out, /\| total \| 1 \| \|/)
    })
})

function statements(withSemi: number, total: number): string {
    return Array.from({length: total}, (_, i) => `const v${i} = ${i}${i < withSemi ? ";" : ""}`).join("\n")
}

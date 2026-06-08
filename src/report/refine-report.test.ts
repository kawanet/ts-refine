import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {refineReport} from "./refine-report.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

const log = {write: (): void => undefined}

describe("refineReport", () => {
    it("throws on an unknown report name (validation moved out of parseArgs)", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        await assert.rejects(
            () =>
                refineReport({
                    project,
                    log,

                    // Intentional typo. The typed surface narrows to known
                    // names, so the cast lets the test reach the runtime
                    // validation that the production CLI also relies on.
                    reports: ["typo-name" as unknown as TSR.ReportName],
                    paths: [],
                }),
            /unknown report name: typo-name/,
        )
    })

    it("returns each requested report's display section regardless of input order", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)

        const titles = async (reports: TSR.ReportName[]) => {
            const report = await refineReport({project, log, reports, paths: []})
            return {semi: report.semi?.sections?.[0]?.title, indent: report.indent?.sections?.[0]?.title}
        }

        // Markdown rendering (and its registry order) is now the CLI's job; the
        // library just hands back the per-report sections. Each slot carries its
        // own section whichever order the caller requested the reports in.
        assert.deepEqual(await titles(["semi", "indent"]), {semi: "--semi on", indent: "(indent)"})
        assert.deepEqual(await titles(["indent", "semi"]), {semi: "--semi on", indent: "(indent)"})
    })

    it("fills section tables with a header row and a total row", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const report = await refineReport({project, log, reports: ["semi"], paths: []})
        const table = report.semi?.sections?.[0]?.table

        assert.deepEqual(table?.[0], ["trailing `;`", "lines", "files", "example"])
        assert.equal(table?.at(-1)?.[0], "total")
    })
})

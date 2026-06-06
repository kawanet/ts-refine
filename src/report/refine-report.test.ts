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
        const lines: string[] = []
        await assert.rejects(
            () =>
                refineReport({
                    project,
                    log,

                    // Intentional typo. The typed surface narrows to known
                    // names, so the cast lets the test reach the runtime
                    // validation that the production CLI also relies on.
                    reports: ["typo-name" as unknown as TSR.ReportName],
                    output: {write: (l) => lines.push(l)},
                    paths: [],
                }),
            /unknown report name: typo-name/,
        )
    })

    it("runs requested reports in registry order regardless of input order", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)

        const run = async (reports: TSR.ReportName[]) => {
            const lines: string[] = []
            await refineReport({
                project,
                log,
                reports,
                output: {write: (l) => lines.push(l)},
                paths: [],
            })
            return lines.filter((v) => /^#/.test(v)).join("")
        }

        // Input deliberately in reverse of registry order to confirm the
        // router re-orders. indent precedes semicolons in the registry.
        assert.equal(await run(["semi", "indent"]), "### --semi on\n### (indent)\n")
        assert.equal(await run(["indent", "semi"]), "### --semi on\n### (indent)\n")
    })
})

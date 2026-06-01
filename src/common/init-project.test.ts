import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {initInMemoryTestProject} from "../test-utils/init-test-project.ts"
import {resolveProject} from "./init-project.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

describe("resolveProject", () => {
    it("returns the caller-supplied project (bring-your-own)", () => {
        const project = initInMemoryTestProject()
        assert.equal(resolveProject({project}), project)
    })

    it("builds a project from tsConfigFilePath", () => {
        const project = resolveProject({tsConfigFilePath: SAMPLE_TSCONFIG})
        assert.ok(project.getSourceFiles().length > 0)
    })

    it("throws when both are given", () => {
        const project = initInMemoryTestProject()
        assert.throws(() => resolveProject({project, tsConfigFilePath: SAMPLE_TSCONFIG}), /not both/)
    })

    it("throws when neither is given", () => {
        assert.throws(() => resolveProject({}), /project.*tsConfigFilePath/)
    })
})

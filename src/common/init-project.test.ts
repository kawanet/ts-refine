import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {createRefineProject, initInMemoryProject, resolveProject} from "./init-project.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

describe("resolveProject", () => {
    it("returns the caller-supplied project (bring-your-own)", () => {
        const project = initInMemoryProject()
        assert.equal(resolveProject({project}), project)
    })

    it("builds a project from tsConfigFilePath", () => {
        const project = resolveProject({tsConfigFilePath: SAMPLE_TSCONFIG})
        assert.ok(project.getSourceFiles().length > 0)
    })

    it("throws when both are given", () => {
        const project = initInMemoryProject()
        assert.throws(() => resolveProject({project, tsConfigFilePath: SAMPLE_TSCONFIG}), /not both/)
    })

    it("throws when neither is given", () => {
        assert.throws(() => resolveProject({}), /project.*tsConfigFilePath/)
    })

    it("rejects a project not built by createRefineProject", () => {
        // A structurally-typed but foreign object must fail loudly, not crash
        // later on a missing internal method.
        const fake = {getSourceFiles: () => []} as unknown as never
        assert.throws(() => resolveProject({project: fake}), /createRefineProject/)
    })
})

describe("createRefineProject", () => {
    it("builds a project from a tsconfig", () => {
        const project = createRefineProject({tsConfigFilePath: SAMPLE_TSCONFIG})
        assert.ok(project.getSourceFiles().length > 0)
    })

    it("throws on a missing tsconfig instead of building an empty project", () => {
        assert.throws(() => createRefineProject({tsConfigFilePath: "/no/such/dir/tsconfig.json"}), /cannot read tsconfig/)
    })

    it("builds an in-memory project files can be added to", () => {
        const project = createRefineProject({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("/p/a.ts", "export const a = 1\n")
        assert.equal(sf.getFullText(), "export const a = 1\n")
        assert.equal(project.getSourceFile("/p/a.ts"), sf)
    })

    it("produces a project usable as the bring-your-own `project`", () => {
        const project = createRefineProject({useInMemoryFileSystem: true})
        assert.equal(resolveProject({project}), project)
    })
})

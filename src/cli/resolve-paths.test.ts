import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {resolvePaths} from "./resolve-paths.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")
const SAMPLE_DIR = path.dirname(SAMPLE_TSCONFIG)

describe("resolvePaths", () => {
    it("defaults to ./tsconfig.json when no path is given", () => {
        assert.equal(resolvePaths(null, []).tsConfigFilePath, path.resolve("tsconfig.json"))
    })

    it("treats a non-.json value as a directory and appends tsconfig.json", () => {
        assert.equal(resolvePaths(SAMPLE_DIR, []).tsConfigFilePath, path.join(SAMPLE_DIR, "tsconfig.json"))
    })

    it("treats `.` the same as omitting the path", () => {
        assert.equal(resolvePaths(".", []).tsConfigFilePath, path.resolve("tsconfig.json"))
    })

    it("resolves positional file globs against the tsconfig directory", () => {
        const {paths} = resolvePaths(SAMPLE_TSCONFIG, ["src/**", "extra.ts"])
        assert.deepEqual(paths, [path.join(SAMPLE_DIR, "src/**"), path.join(SAMPLE_DIR, "extra.ts")])
    })
})

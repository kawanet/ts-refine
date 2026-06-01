import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {initInMemoryTestProject, initTestProject} from "../test-utils/init-test-project.ts"
import {refineList} from "./refine-list.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

const log = {write: () => {}}

describe("refineList (sample/basic)", () => {
    it("reports per-file export / unused / importer counts", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const entries = await refineList({project, log, paths: []})

        const got = Object.fromEntries(entries.map((e) => [path.basename(e.file), {exports: e.exports, unused: e.unused, importers: e.importers}]))
        assert.deepEqual(got, {
            // entry point: exports nothing, imported by nobody
            "index.ts": {exports: 0, unused: 0, importers: 0},

            // one export used externally, one not
            "partial.ts": {exports: 2, unused: 1, importers: 1},

            // both exports unused, never imported
            "unused.ts": {exports: 2, unused: 2, importers: 0},

            // both exports used externally
            "used.ts": {exports: 2, unused: 0, importers: 1},
        })
    })

    it("scopes to the given file globs", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const dir = path.dirname(SAMPLE_TSCONFIG)
        const entries = await refineList({project, log, paths: [path.join(dir, "src/used.ts")]})
        assert.deepEqual(
            entries.map((e) => path.basename(e.file)),
            ["used.ts"],
        )
    })

    it("includes in-project .d.ts files", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/types.d.ts", 'import {x} from "./a.ts"\nexport type T = typeof x\n')
        const entries = await refineList({project, log, paths: []})

        // The .d.ts is listed, and counts as an importer of a.ts.
        assert.ok(entries.some((e) => path.basename(e.file) === "types.d.ts"))
        const a = entries.find((e) => path.basename(e.file) === "a.ts")!
        assert.equal(a.importers, 1)
    })
})

// sample/basic: index.ts {0,0,0}, partial.ts {2,1,1}, unused.ts {2,2,0},
// used.ts {2,0,1} (exports/unused/importers).
describe("refineList filters (sample/basic)", () => {
    async function names(filters: TSR.ListFilters): Promise<string[]> {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const entries = await refineList({project, log, paths: [], filters})
        return entries.map((e) => path.basename(e.file))
    }

    it("--no-exports keeps only files that export nothing", async () => {
        assert.deepEqual(await names({noExports: true}), ["index.ts"])
    })

    it("--no-importers keeps only files no one imports", async () => {
        assert.deepEqual(await names({noImporters: true}), ["index.ts", "unused.ts"])
    })

    it("--unused-exports keeps only files with unused exports", async () => {
        assert.deepEqual(await names({unusedExports: true}), ["partial.ts", "unused.ts"])
    })

    it("combines multiple filters with AND", async () => {
        assert.deepEqual(await names({noImporters: true, unusedExports: true}), ["unused.ts"])
    })

    it("yields nothing for a contradictory AND (no exports yet unused exports)", async () => {
        assert.deepEqual(await names({noExports: true, unusedExports: true}), [])
    })
})

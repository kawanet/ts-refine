import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {ts} from "ts-morph"
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

const BUNDLER = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
} as const

describe("refineList --ref", () => {
    async function refNames(ref: string, files: Record<string, string>, filters?: TSR.ListFilters): Promise<string[]> {
        const project = initInMemoryTestProject(BUNDLER)
        for (const [name, text] of Object.entries(files)) project.createSourceFile(name, text)
        const entries = await refineList({project, log, paths: [], filters: {...filters, ref}})
        return entries.map((e) => e.file).sort()
    }

    it("keeps the declaring file and every file that uses a plain identifier", async () => {
        const got = await refNames("funcA", {
            "/libs.ts": "export function funcA() { return 1 }\n",
            "/imp.ts": 'import {funcA} from "./libs.ts"\nexport const u = funcA()\n',
            "/other.ts": "export const x = 1\n",
        })
        assert.deepEqual(got, ["imp.ts", "libs.ts"])
    })

    it("resolves a namespace member (ns.member)", async () => {
        const got = await refNames("NS.fn", {
            "/ns.ts": "export namespace NS {\n    export function fn() { return 1 }\n}\n",
            "/use.ts": 'import {NS} from "./ns.ts"\nexport const r = NS.fn()\n',
            "/other.ts": "export const x = 1\n",
        })
        assert.deepEqual(got, ["ns.ts", "use.ts"])
    })

    it("resolves an interface property (Type.prop)", async () => {
        const got = await refNames("Shape.width", {
            "/types.ts": "export interface Shape { width: number }\n",
            "/use.ts": 'import type {Shape} from "./types.ts"\nexport const w = (s: Shape) => s.width\n',
            "/other.ts": "export const x = 1\n",
        })
        assert.deepEqual(got, ["types.ts", "use.ts"])
    })

    it("resolves a namespace-nested property (ns.Type.prop)", async () => {
        const got = await refNames("NS2.Box.w", {
            "/ns2.ts": "export namespace NS2 {\n    export interface Box { w: number }\n}\n",
            "/use.ts": 'import {NS2} from "./ns2.ts"\nexport const f = (b: NS2.Box) => b.w\n',
            "/other.ts": "export const x = 1\n",
        })
        assert.deepEqual(got, ["ns2.ts", "use.ts"])
    })

    it("combines --ref with another filter using AND", async () => {
        // libs.ts is imported (importers=1), imp.ts is not — so --no-importers
        // narrows the funcA reference set down to imp.ts.
        const got = await refNames(
            "funcA",
            {
                "/libs.ts": "export function funcA() { return 1 }\n",
                "/imp.ts": 'import {funcA} from "./libs.ts"\nexport const u = funcA()\n',
            },
            {noImporters: true},
        )
        assert.deepEqual(got, ["imp.ts"])
    })

    it("throws when the target is not found", async () => {
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/libs.ts", "export const x = 1\n")
        await assert.rejects(refineList({project, log, paths: [], filters: {ref: "nope"}}), /no exported identifier/)
    })
})

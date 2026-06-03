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

    it("excludes JSON modules (resolveJsonModule) from the listing", async () => {
        const project = initInMemoryTestProject({
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            resolveJsonModule: true,
            allowImportingTsExtensions: true,
        })
        project.createSourceFile("/data.json", '{"a": 1}\n')
        project.createSourceFile("/main.ts", 'import DATA from "./data.json" with {type: "json"}\nexport const v = DATA.a\n')
        const entries = await refineList({project, log, paths: []})

        // JSON isn't TypeScript; it never belongs in the cleanup listing.
        assert.deepEqual(
            entries.map((e) => path.basename(e.file)),
            ["main.ts"],
        )
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

describe("refineList progress log (sample/basic)", () => {
    async function logLine(filters?: TSR.ListFilters): Promise<string> {
        let logged = ""
        const project = initTestProject(SAMPLE_TSCONFIG)
        await refineList({project, log: {write: (s) => (logged += s)}, paths: [], filters})
        return logged.trim()
    }

    it("reports the total when nothing is filtered out", async () => {
        // 4 sample files, none filtered away.
        assert.equal(await logLine(), "list: 4 files found / 4 files total")
    })

    it("reports the matched count against the total when a filter narrows it", async () => {
        // --no-importers keeps only index.ts and unused.ts of the 4.
        assert.equal(await logLine({noImporters: true}), "list: 2 files found / 4 files total")
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

    it("throws when the target is neither exported nor imported", async () => {
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/libs.ts", "export const x = 1\n")
        await assert.rejects(refineList({project, log, paths: [], filters: {ref: "nope"}}), /no exported or imported identifier/)
    })

    it("OR-unions a name declared in several in-project files", async () => {
        // Unlike rename (which requires a single match), list unions same-name
        // declarations: every file that uses either `dup` is listed.
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/a.ts", "export const dup = 1\n")
        project.createSourceFile("/b.ts", "export const dup = 2\n")
        const entries = await refineList({project, log, paths: [], filters: {ref: "dup"}})
        assert.deepEqual(entries.map((e) => e.file).sort(), ["a.ts", "b.ts"])
    })

    it("falls back to an import binding for a symbol the project only imports (e.g. a dependency type)", async () => {
        // `Widget` is not exported by any in-project file — it comes from an
        // ambient (dependency-like) module. `--ref` should still find every
        // in-project file that imports/uses it, via the import binding.
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/shims.d.ts", 'declare module "somelib" {\n    export class Widget {}\n}\n')
        project.createSourceFile("/main.ts", 'import {Widget} from "somelib"\nexport const f = (w: Widget) => w\n')
        project.createSourceFile("/other.ts", 'import {Widget} from "somelib"\nexport const g = (w: Widget) => w\n')
        project.createSourceFile("/nouse.ts", "export const z = 1\n")

        const entries = await refineList({project, log, paths: [], filters: {ref: "Widget"}})
        assert.deepEqual(entries.map((e) => e.file).sort(), ["main.ts", "other.ts", "shims.d.ts"])
    })

    it("resolves a member of an imported (dependency) type — e.g. Project.getSourceFiles", async () => {
        // `Widget.render` is the method of a dependency class; --ref should find
        // only the files that call `.render()`, not those using other members.
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/shims.d.ts", 'declare module "somelib" {\n    export class Widget {\n        render(): void\n        name: string\n    }\n}\n')
        project.createSourceFile("/a.ts", 'import {Widget} from "somelib"\nexport const f = (w: Widget) => w.render()\n')
        project.createSourceFile("/b.ts", 'import {Widget} from "somelib"\nexport const g = (w: Widget) => w.render()\n')
        project.createSourceFile("/c.ts", 'import {Widget} from "somelib"\nexport const h = (w: Widget) => w.name\n')

        const entries = await refineList({project, log, paths: [], filters: {ref: "Widget.render"}})
        const files = entries.map((e) => e.file)
        assert.ok(files.includes("a.ts") && files.includes("b.ts"), `expected a.ts and b.ts, got ${files.join(", ")}`)
        assert.ok(!files.includes("c.ts"), `c.ts uses .name, not .render: ${files.join(", ")}`)
    })

    it("OR-unions a name imported from different dependencies", async () => {
        // Two distinct `Widget` symbols (libX, libY); both imported sites union.
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/shims.d.ts", 'declare module "libX" {\n    export class Widget {}\n}\ndeclare module "libY" {\n    export class Widget {}\n}\n')
        project.createSourceFile("/a.ts", 'import {Widget} from "libX"\nexport const f = (w: Widget) => w\n')
        project.createSourceFile("/b.ts", 'import {Widget} from "libY"\nexport const g = (w: Widget) => w\n')
        const files = (await refineList({project, log, paths: [], filters: {ref: "Widget"}})).map((e) => e.file).sort()
        assert.deepEqual(files, ["a.ts", "b.ts", "shims.d.ts"])
    })

    it("anchors a bare imported root on its binding, even for an anonymous default export", async () => {
        // The dependency's default export has no name; anchoring on the local
        // import binding still finds every file that uses it.
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/shims.d.ts", 'declare module "anon" {\n    export default function (): number\n}\n')
        project.createSourceFile("/a.ts", 'import run from "anon"\nexport const x = run()\n')
        project.createSourceFile("/b.ts", 'import run from "anon"\nexport const y = run()\n')

        const files = (await refineList({project, log, paths: [], filters: {ref: "run"}})).map((e) => e.file)
        assert.ok(files.includes("a.ts") && files.includes("b.ts"), `expected a.ts and b.ts, got ${files.join(", ")}`)
    })

    it("resolves members of an imported (dependency) namespace, including nested types", async () => {
        // The same dotted forms that work for an in-project namespace must work
        // when the namespace is imported from a dependency.
        const project = initInMemoryTestProject(BUNDLER)
        project.createSourceFile("/shims.d.ts", 'declare module "lib" {\n    export namespace NS {\n        export interface Box {\n            w: number\n        }\n        export function fn(): void\n    }\n}\n')
        project.createSourceFile("/a.ts", 'import {NS} from "lib"\nexport const f = (b: NS.Box) => b.w\n')
        project.createSourceFile("/b.ts", 'import {NS} from "lib"\nexport const g = () => NS.fn()\n')

        const refFiles = async (ref: string) => (await refineList({project, log, paths: [], filters: {ref}})).map((e) => e.file)
        assert.ok((await refFiles("NS.Box")).includes("a.ts")) // ns.member
        assert.ok((await refFiles("NS.Box.w")).includes("a.ts")) // ns.Type.prop
        assert.ok((await refFiles("NS.fn")).includes("b.ts")) // ns.member (function)
    })
})

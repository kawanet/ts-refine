import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {initInMemoryProject} from "../common/init-project.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {refineInspect} from "./refine-inspect.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

const log = {write: (): void => undefined}

describe("refineInspect", () => {
    it("returns one InspectExport per export with importers count and alphabetical example", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const files = await refineInspect({project, log, paths: [], inspectors: ["exports"]})

        const byName = Object.fromEntries(files.map((f) => [path.basename(f.file), f]))
        const used = byName["used.ts"]
        assert.ok(used.exports)

        // used.ts exports two values, both consumed by index.ts.
        assert.equal(used.exports.length, 2)
        for (const e of used.exports) {
            assert.equal(e.importers, 1)
            assert.equal(e.example, "sample/basic/src/index.ts")
        }

        // unused.ts has two exports, neither referenced externally.
        const unused = byName["unused.ts"]
        assert.deepEqual(
            unused.exports!.map((e) => ({name: e.name, importers: e.importers, example: e.example})),
            [
                {name: "deadConst", importers: 0, example: undefined},
                {name: "DeadType", importers: 0, example: undefined},
            ],
        )
    })

    it("scopes to the given file globs", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const dir = path.dirname(SAMPLE_TSCONFIG)
        const files = await refineInspect({project, log, paths: [path.join(dir, "src/used.ts")], inspectors: ["exports"]})
        assert.deepEqual(
            files.map((f) => path.basename(f.file)),
            ["used.ts"],
        )
    })

    it("rejects an unknown inspector name", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        await assert.rejects(() => refineInspect({project, log, paths: [], inspectors: ["typo" as unknown as TSR.InspectorName]}), /unknown inspector name: typo/)
    })

    it("classifies each importer form (value / type / namespace / side-effect / re-export / dynamic / mixed)", async () => {
        const project = initInMemoryProject({allowImportingTsExtensions: true})
        project.createSourceFile("/target.ts", "export const x = 1\nexport type T = number\n")
        project.createSourceFile("/value.ts", 'import {x} from "./target.ts"\nconst _ = x\n')
        project.createSourceFile("/type.ts", 'import type {T} from "./target.ts"\nconst _: T = 1\n')
        project.createSourceFile("/ns.ts", 'import * as A from "./target.ts"\nconst _ = A.x\n')
        project.createSourceFile("/side.ts", 'import "./target.ts"\n')
        project.createSourceFile("/reexp.ts", 'export {x} from "./target.ts"\nexport * from "./target.ts"\n')
        project.createSourceFile("/dyn.ts", 'export const load = () => import("./target.ts")\n')
        project.createSourceFile("/mixed.ts", 'import {x, type T} from "./target.ts"\nconst _: T = x\n')

        const files = await refineInspect({project, log, paths: ["/target.ts"], inspectors: ["importers"]})
        assert.equal(files.length, 1)
        const got = Object.fromEntries(files[0].importers!.map((i) => [i.file.replace(/^.*\//, ""), {kinds: i.kinds, names: i.names}]))
        assert.deepEqual(got["value.ts"], {kinds: ["value"], names: ["x"]})
        assert.deepEqual(got["type.ts"], {kinds: ["type"], names: ["T"]})
        assert.deepEqual(got["ns.ts"], {kinds: ["namespace"], names: ["* as A"]})
        assert.deepEqual(got["side.ts"], {kinds: ["side-effect"], names: ["(side effect)"]})

        // Re-export: `export {x}` adds the name, `export * from` adds the
        // wildcard token; both sorted alphabetically.
        assert.deepEqual(got["reexp.ts"], {kinds: ["re-export"], names: ["*", "x"]})
        assert.deepEqual(got["dyn.ts"], {kinds: ["dynamic"], names: ["(dynamic)"]})

        // Mixed: at least one value name → "value" (the value-includes
        // catch-all that pairs with the type-only "type" kind).
        assert.deepEqual(got["mixed.ts"], {kinds: ["value"], names: ["type T", "x"]})
    })

    it("returns an empty importers list when nothing imports the file", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("/orphan.ts", "export const x = 1\n")
        const files = await refineInspect({project, log, paths: ["/orphan.ts"], inspectors: ["importers"]})
        assert.deepEqual(files[0].importers, [])
    })

    it("counts an in-project .d.ts as an importer", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("/target.ts", "export const x = 1\n")
        project.createSourceFile("/ambient.d.ts", 'import {x} from "./target.ts"\ndeclare const _: typeof x\n')
        const files = await refineInspect({project, log, paths: ["/target.ts"], inspectors: ["importers"]})
        assert.ok(files[0].importers!.some((i) => i.file.endsWith("ambient.d.ts")))
    })
})

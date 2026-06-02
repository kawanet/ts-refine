import {strict as assert} from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {after, before, describe, it} from "node:test"
import {Project, ts} from "ts-morph"
import type {TSR} from "ts-refine"
import {initInMemoryTestProject, initTestProject} from "../test-utils/init-test-project.ts"
import {refineMove} from "./refine-move.ts"

// organizeImports after a move follows the surveyed style; these pin the
// bracket-spacing so the expected import text is deterministic.
const NO_SPACE: TSR.FormatStyle = {bracketSpacing: "off"}
const SPACED: TSR.FormatStyle = {bracketSpacing: "on"}

function newProject(): Project {
    return initInMemoryTestProject({
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowImportingTsExtensions: true,
    })
}

const log = {write: () => {}}

describe("refineMove (in-memory, dry-run)", () => {
    it("rewrites every import form and preserves the `.ts` extension where it was present", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\nexport type T = number\n")
        const b = project.createSourceFile(
            "/src/b.ts",
            ['import {x} from "./a.ts"', 'import type {T} from "./a.ts"', 'import * as A from "./a.ts"', 'export {x as y} from "./a.ts"', 'const _d = import("./a.ts")', "const _t: T = x", "const _a = A.x", ""].join("\n"),
        )
        const result = await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})

        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/src/sub/a.ts"}])

        // organizeImports re-sorts the import declarations (type, namespace,
        // named); the re-export and dynamic import keep their place. Each
        // specifier still carries its restored `.ts` extension.
        assert.equal(
            b.getFullText(),
            ['import type {T} from "./sub/a.ts"', 'import * as A from "./sub/a.ts"', 'import {x} from "./sub/a.ts"', 'export {x as y} from "./sub/a.ts"', 'const _d = import("./sub/a.ts")', "const _t: T = x", "const _a = A.x", ""].join("\n"),
        )
    })

    it("preserves the mandatory `.json` extension when moving a file that imports JSON", async () => {
        const project = initInMemoryTestProject({
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            resolveJsonModule: true,
            allowImportingTsExtensions: true,
        })
        project.createSourceFile("/src/data.json", '{"a": 1}\n')
        project.createSourceFile("/src/main.ts", 'import DATA from "./data.json" with {type: "json"}\nexport const v = DATA.a\n')
        await refineMove({project, log, sources: ["/src/main.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})

        // `.json` is required to resolve; the move must keep it, not strip to "../data".
        assert.equal(project.getSourceFileOrThrow("/src/sub/main.ts").getFullText(), 'import DATA from "../data.json" with {type: "json"}\nexport const v = DATA.a\n')
    })

    it("does not add `.ts` to importers that omitted it", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const c = project.createSourceFile("/src/c.ts", 'import {x} from "./a"\nconst _ = x\n')
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})
        assert.equal(c.getFullText(), 'import {x} from "./sub/a"\nconst _ = x\n')
    })

    it("preserves the dynamic-import extension across the NodeNext js↔ts mapping (.mjs → .mts source)", async () => {
        // import("./a.mjs") resolves to /src/a.mts under NodeNext. The
        // restoration must put `.mjs` back, not strip to bare `./a`.
        const project = initInMemoryTestProject({
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            allowImportingTsExtensions: true,
        })
        project.createSourceFile("/src/a.mts", "export const x = 1\n")
        const b = project.createSourceFile("/src/b.ts", 'const _ = import("./a.mjs")\n')
        await refineMove({project, log, sources: ["/src/a.mts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})
        assert.equal(b.getFullText(), 'const _ = import("./sub/a.mjs")\n')
    })

    it("preserves whatever extension each importer wrote (.ts / .js / none in one file)", async () => {
        // NodeNext-style resolver — `./a.js` is a valid way to refer to a.ts.
        const project = initInMemoryTestProject({
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            allowImportingTsExtensions: true,
        })
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const b = project.createSourceFile("/src/b.ts", ['import {x as x1} from "./a.ts"', 'import {x as x2} from "./a.js"', 'import {x as x3} from "./a"', "const _ = x1 + x2 + x3", ""].join("\n"))
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})

        // Each row keeps its own era's extension; nothing is migrated.
        // organizeImports sorts by specifier, so the bare-then-.js-then-.ts
        // order follows from string ordering of the rewritten paths.
        assert.equal(b.getFullText(), ['import {x as x3} from "./sub/a"', 'import {x as x2} from "./sub/a.js"', 'import {x as x1} from "./sub/a.ts"', "const _ = x1 + x2 + x3", ""].join("\n"))
    })

    it("rewrites the moved file's own outgoing relative imports too", async () => {
        const project = newProject()
        project.createSourceFile("/src/sibling.ts", "export const y = 2\n")
        const a = project.createSourceFile("/src/a.ts", 'import {y} from "./sibling.ts"\nexport const x = y\n')
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})
        assert.equal(a.getFullText(), 'import {y} from "../sibling.ts"\nexport const x = y\n')
    })

    it("treats a trailing-slash dest as a directory move when multiple sources are given", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "export const y = 2\n")
        const result = await refineMove({project, log, sources: ["/src/a.ts", "/src/b.ts"], dest: "/lib/", dryRun: true, format: NO_SPACE})
        assert.deepEqual(result.moves, [
            {from: "/src/a.ts", to: "/lib/a.ts"},
            {from: "/src/b.ts", to: "/lib/b.ts"},
        ])
    })

    it("treats a single-source non-directory dest as a rename", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const result = await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/renamed.ts", dryRun: true, format: NO_SPACE})
        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/src/renamed.ts"}])
    })

    it("rejects multi-source moves into a non-directory dest", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "export const y = 2\n")
        await assert.rejects(() => refineMove({project, log, sources: ["/src/a.ts", "/src/b.ts"], dest: "/src/target.ts", dryRun: true, format: NO_SPACE}), /destination must be an existing directory/)
    })

    it("rejects a source that is not in the project", async () => {
        const project = newProject()
        await assert.rejects(() => refineMove({project, log, sources: ["/src/missing.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE}), /not in the project/)
    })

    it("rejects when source and destination are the same path", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        await assert.rejects(() => refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/a.ts", dryRun: true, format: NO_SPACE}), /source and destination are the same/)
    })

    it("rejects when destination is an existing project file that isn't being moved out", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "export const y = 2\n")
        await assert.rejects(() => refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/b.ts", dryRun: true, format: NO_SPACE}), /destination already exists/)
    })

    it("rejects when destination is on the project FS but excluded from the tsconfig", async () => {
        // dist/precious.ts exists on the project FS but isn't a SourceFile
        // in the project (excluded by tsconfig). sf.save() would still
        // overwrite it on disk, so the planner has to consult the FS too.
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")

        // Drop a file directly onto the in-memory FS without registering
        // it as a project SourceFile.
        project.getFileSystem().writeFileSync("/dist/precious.ts", "// excluded but real\n")
        await assert.rejects(() => refineMove({project, log, sources: ["/src/a.ts"], dest: "/dist/precious.ts", dryRun: true, format: NO_SPACE}), /destination already exists/)
    })

    it("includes .d.ts importers in the rewrite scan", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const dts = project.createSourceFile("/src/ambient.d.ts", 'import {x} from "./a.ts"\ndeclare const _: typeof x\n')
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})

        // The .d.ts specifier was rewritten AND its `.ts` extension was restored.
        assert.equal(dts.getFullText(), 'import {x} from "./sub/a.ts"\ndeclare const _: typeof x\n')
    })

    it("resolves dynamic imports that target a directory's index file", async () => {
        // `import("./feature")` resolves to ./feature/index.ts under Node-
        // style resolution; the snapshot must capture this so the file gets
        // saved when the index module moves.
        const project = newProject()
        project.createSourceFile("/src/feature/index.ts", "export const x = 1\n")
        const b = project.createSourceFile("/src/b.ts", 'const _ = import("./feature")\n')
        const result = await refineMove({project, log, sources: ["/src/feature/index.ts"], dest: "/src/sub/index.ts", dryRun: true, format: NO_SPACE})

        // b.ts must appear in touched (so it would be saved end-to-end).
        assert.ok(result.touched.includes(b.getFilePath()), `b.ts must be reported as touched; got: ${JSON.stringify(result.touched)}`)
    })

    it("recognizes in-memory directories without a trailing slash (project FS, not host FS)", async () => {
        const project = newProject()

        // An in-memory directory exists when any source file lives under it.
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/lib/keep.ts", "export const k = 0\n")

        // `/lib` has no trailing slash; the project's in-memory FS reports it
        // as a directory, so we treat the move as a directory move.
        const result = await refineMove({project, log, sources: ["/src/a.ts"], dest: "/lib", dryRun: true, format: NO_SPACE})
        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/lib/a.ts"}])
    })

    it("reports the planned moves and the touched importer files", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", 'import {x} from "./a.ts"\nconst _ = x\n')
        project.createSourceFile("/src/orphan.ts", "export const z = 3\n")
        const result = await refineMove({project, log, sources: ["/src/a.ts"], dest: "/lib/", dryRun: true, format: NO_SPACE})
        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/lib/a.ts"}])
        assert.deepEqual([...result.touched].sort(), ["/lib/a.ts", "/src/b.ts"])
    })

    it("re-sorts the import block of an import-changed file", async () => {
        const project = newProject()
        project.createSourceFile("/src/m.ts", "export const m = 1\n")
        project.createSourceFile("/src/z.ts", "export const z = 1\n")
        const imp = project.createSourceFile("/src/imp.ts", ['import {z} from "./z.ts"', 'import {m} from "./m.ts"', "const _ = z + m", ""].join("\n"))
        await refineMove({project, log, sources: ["/src/m.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})

        // m moved under sub/, so "./sub/m.ts" sorts before "./z.ts" and the
        // two import lines swap — organizeImports ran on the changed file.
        assert.equal(imp.getFullText(), ['import {m} from "./sub/m.ts"', 'import {z} from "./z.ts"', "const _ = z + m", ""].join("\n"))
    })

    it("applies the surveyed no-space style, overriding the file's spaces", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\nexport const w = 2\n")

        // The file wrote `{ x, w }` (spaced) but the survey says no-space.
        const sp = project.createSourceFile("/src/sp.ts", ['import { x, w } from "./a.ts"', "const _ = x + w", ""].join("\n"))
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})
        assert.equal(sp.getFullText(), ['import {w, x} from "./sub/a.ts"', "const _ = x + w", ""].join("\n"))
    })

    it("applies the surveyed spaced style, overriding the file's no-space", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\nexport const w = 2\n")

        // The file wrote `{x,w}` (no space) but the survey says spaced.
        const ns = project.createSourceFile("/src/ns.ts", ['import {x,w} from "./a.ts"', "const _ = x + w", ""].join("\n"))
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: SPACED})
        assert.equal(ns.getFullText(), ['import { w, x } from "./sub/a.ts"', "const _ = x + w", ""].join("\n"))
    })

    it("never reformats a file that does not import the moved file", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/p.ts", "export const p = 1\n")
        project.createSourceFile("/src/q.ts", "export const q = 1\n")

        // Deliberately unsorted imports, none of them targeting the moved file.
        const u = project.createSourceFile("/src/u.ts", ['import {q} from "./q.ts"', 'import {p} from "./p.ts"', "const _ = p + q", ""].join("\n"))
        const result = await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format: NO_SPACE})
        assert.ok(!result.touched.includes("/src/u.ts"))

        // Its unsorted import block is left exactly as written.
        assert.equal(u.getFullText(), ['import {q} from "./q.ts"', 'import {p} from "./p.ts"', "const _ = p + q", ""].join("\n"))
    })

    it("samples a per-file style resolver at each file's pre-move path", async () => {
        const project = newProject()
        project.createSourceFile("/src/dep.ts", "export const y = 2\n")
        project.createSourceFile("/src/a.ts", 'import {y} from "./dep.ts"\nexport const x = y\n')
        project.createSourceFile("/src/b.ts", 'import {x} from "./a.ts"\nconst _ = x\n')

        // The resolver must see the moved file (which has its own import to
        // re-sort) at its original path, before relocation repaths it.
        const seen: string[] = []
        const format = (file: string): Promise<TSR.FormatStyle> => {
            seen.push(file)
            return Promise.resolve(NO_SPACE)
        }
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format})

        assert.ok(seen.includes("/src/a.ts"), `moved file should be sampled at its pre-move path; saw ${JSON.stringify(seen)}`)
        assert.ok(!seen.includes("/src/sub/a.ts"), `must not sample the post-move path; saw ${JSON.stringify(seen)}`)
        assert.ok(seen.includes("/src/b.ts"), `importer should be sampled at its own path; saw ${JSON.stringify(seen)}`)
    })

    it("organizes each changed file with its own per-file style", async () => {
        const project = newProject()
        project.createSourceFile("/src/dep.ts", "export const y = 2\n")
        project.createSourceFile("/src/a.ts", 'import {y} from "./dep.ts"\nexport const x = y\n')
        const b = project.createSourceFile("/src/b.ts", 'import {x} from "./a.ts"\nconst _ = x\n')

        // Moved file gets spaced braces, the importer gets tight braces.
        const format = (file: string): Promise<TSR.FormatStyle> => Promise.resolve(file.endsWith("/a.ts") ? SPACED : NO_SPACE)
        await refineMove({project, log, sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true, format})

        assert.match(project.getSourceFileOrThrow("/src/sub/a.ts").getFullText(), /import \{ y \} from "\.\.\/dep\.ts"/)
        assert.match(b.getFullText(), /import \{x\} from "\.\/sub\/a\.ts"/)
    })
})

describe("refineMove (on disk)", () => {
    let workdir: string

    before(async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ts-refine-move-"))
        await fs.mkdir(path.join(workdir, "src"))
        await fs.writeFile(
            path.join(workdir, "tsconfig.json"),
            JSON.stringify({
                compilerOptions: {target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, allowImportingTsExtensions: true, noEmit: true},
                include: ["src/**/*"],
            }),
        )
        await fs.writeFile(path.join(workdir, "src/a.ts"), "export const x = 1\n")
        await fs.writeFile(path.join(workdir, "src/b.ts"), 'import {x} from "./a.ts"\nconst _ = x\n')
    })

    after(async () => {
        await fs.rm(workdir, {recursive: true, force: true})
    })

    it("does not persist unrelated pending edits on the project (selective save)", async () => {
        const sub = await fs.mkdtemp(path.join(os.tmpdir(), "ts-refine-move-save-"))
        try {
            await fs.mkdir(path.join(sub, "src"))
            await fs.writeFile(
                path.join(sub, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, allowImportingTsExtensions: true, noEmit: true},
                    include: ["src/**/*"],
                }),
            )
            await fs.writeFile(path.join(sub, "src/a.ts"), "export const x = 1\n")
            await fs.writeFile(path.join(sub, "src/b.ts"), 'import {x} from "./a.ts"\nconst _ = x\n')
            await fs.writeFile(path.join(sub, "src/unrelated.ts"), "export const z = 3 // ORIGINAL\n")

            const project = initTestProject(path.join(sub, "tsconfig.json"))

            // Caller's pending edit on a file refineMove never touches.
            project.getSourceFileOrThrow(path.join(sub, "src/unrelated.ts")).replaceWithText("export const z = 999 // CALLER EDIT\n")
            await refineMove({project, log, sources: [path.join(sub, "src/a.ts")], dest: path.join(sub, "lib/"), dryRun: false, format: NO_SPACE})

            // unrelated.ts on disk must stay at the original content.
            const onDisk = await fs.readFile(path.join(sub, "src/unrelated.ts"), "utf8")
            assert.equal(onDisk, "export const z = 3 // ORIGINAL\n")

            // And the move itself still happened end-to-end.
            await assert.rejects(fs.access(path.join(sub, "src/a.ts")))
            assert.equal(await fs.readFile(path.join(sub, "lib/a.ts"), "utf8"), "export const x = 1\n")
            assert.equal(await fs.readFile(path.join(sub, "src/b.ts"), "utf8"), 'import {x} from "../lib/a.ts"\nconst _ = x\n')
        } finally {
            await fs.rm(sub, {recursive: true, force: true})
        }
    })

    it("persists the move and the importer rewrite to disk", async () => {
        const project = initTestProject(path.join(workdir, "tsconfig.json"))
        await refineMove({project, log, sources: [path.join(workdir, "src/a.ts")], dest: path.join(workdir, "lib/"), dryRun: false, format: NO_SPACE})

        // Old path is gone, new path holds the original content.
        await assert.rejects(fs.access(path.join(workdir, "src/a.ts")))
        const moved = await fs.readFile(path.join(workdir, "lib/a.ts"), "utf8")
        assert.equal(moved, "export const x = 1\n")

        // Importer's specifier rewritten on disk with `.ts` preserved.
        const importer = await fs.readFile(path.join(workdir, "src/b.ts"), "utf8")
        assert.equal(importer, 'import {x} from "../lib/a.ts"\nconst _ = x\n')
    })
})

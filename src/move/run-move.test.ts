import {strict as assert} from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {after, before, describe, it} from "node:test"
import {Project, ts} from "ts-morph"
import {runMove} from "./run-move.ts"

function newProject(): Project {
    return new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowImportingTsExtensions: true,
        } as any,
    })
}

describe("runMove (in-memory, dry-run)", () => {
    it("rewrites every import form and preserves the `.ts` extension where it was present", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\nexport type T = number\n")
        const b = project.createSourceFile(
            "/src/b.ts",
            ["import {x} from \"./a.ts\"", "import type {T} from \"./a.ts\"", "import * as A from \"./a.ts\"", "export {x as y} from \"./a.ts\"", "const _d = import(\"./a.ts\")", "const _t: T = x", "const _a = A.x", ""].join("\n"),
        )
        const result = await runMove(project, {sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true})

        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/src/sub/a.ts"}])
        assert.equal(b.getFullText(),
            ["import {x} from \"./sub/a.ts\"", "import type {T} from \"./sub/a.ts\"", "import * as A from \"./sub/a.ts\"", "export {x as y} from \"./sub/a.ts\"", "const _d = import(\"./sub/a.ts\")", "const _t: T = x", "const _a = A.x", ""].join("\n"))
    })

    it("does not add `.ts` to importers that omitted it", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const c = project.createSourceFile("/src/c.ts", "import {x} from \"./a\"\nconst _ = x\n")
        await runMove(project, {sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true})
        assert.equal(c.getFullText(), "import {x} from \"./sub/a\"\nconst _ = x\n")
    })

    it("preserves whatever extension each importer wrote (.ts / .js / none in one file)", async () => {
        // NodeNext-style resolver — `./a.js` is a valid way to refer to a.ts.
        const project = new Project({
            useInMemoryFileSystem: true,
            compilerOptions: {
                module: ts.ModuleKind.NodeNext,
                moduleResolution: ts.ModuleResolutionKind.NodeNext,
                allowImportingTsExtensions: true,
            } as any,
        })
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const b = project.createSourceFile("/src/b.ts",
            ["import {x as x1} from \"./a.ts\"", "import {x as x2} from \"./a.js\"", "import {x as x3} from \"./a\"", "const _ = x1 + x2 + x3", ""].join("\n"),
        )
        await runMove(project, {sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true})
        // Each row keeps its own era's extension; nothing is migrated.
        assert.equal(b.getFullText(),
            ["import {x as x1} from \"./sub/a.ts\"", "import {x as x2} from \"./sub/a.js\"", "import {x as x3} from \"./sub/a\"", "const _ = x1 + x2 + x3", ""].join("\n"))
    })

    it("rewrites the moved file's own outgoing relative imports too", async () => {
        const project = newProject()
        project.createSourceFile("/src/sibling.ts", "export const y = 2\n")
        const a = project.createSourceFile("/src/a.ts", "import {y} from \"./sibling.ts\"\nexport const x = y\n")
        await runMove(project, {sources: ["/src/a.ts"], dest: "/src/sub/", dryRun: true})
        assert.equal(a.getFullText(), "import {y} from \"../sibling.ts\"\nexport const x = y\n")
    })

    it("treats a trailing-slash dest as a directory move when multiple sources are given", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "export const y = 2\n")
        const result = await runMove(project, {sources: ["/src/a.ts", "/src/b.ts"], dest: "/lib/", dryRun: true})
        assert.deepEqual(result.moves, [
            {from: "/src/a.ts", to: "/lib/a.ts"},
            {from: "/src/b.ts", to: "/lib/b.ts"},
        ])
    })

    it("treats a single-source non-directory dest as a rename", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        const result = await runMove(project, {sources: ["/src/a.ts"], dest: "/src/renamed.ts", dryRun: true})
        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/src/renamed.ts"}])
    })

    it("rejects multi-source moves into a non-directory dest", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "export const y = 2\n")
        await assert.rejects(
            () => runMove(project, {sources: ["/src/a.ts", "/src/b.ts"], dest: "/src/target.ts", dryRun: true}),
            /destination must be an existing directory/,
        )
    })

    it("rejects a source that is not in the project", async () => {
        const project = newProject()
        await assert.rejects(
            () => runMove(project, {sources: ["/src/missing.ts"], dest: "/src/sub/", dryRun: true}),
            /not in the project/,
        )
    })

    it("rejects when source and destination are the same path", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        await assert.rejects(
            () => runMove(project, {sources: ["/src/a.ts"], dest: "/src/a.ts", dryRun: true}),
            /source and destination are the same/,
        )
    })

    it("rejects when destination is an existing project file that isn't being moved out", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "export const y = 2\n")
        await assert.rejects(
            () => runMove(project, {sources: ["/src/a.ts"], dest: "/src/b.ts", dryRun: true}),
            /destination is an existing project file/,
        )
    })

    it("recognizes in-memory directories without a trailing slash (project FS, not host FS)", async () => {
        const project = newProject()
        // An in-memory directory exists when any source file lives under it.
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/lib/keep.ts", "export const k = 0\n")
        // `/lib` has no trailing slash; the project's in-memory FS reports it
        // as a directory, so we treat the move as a directory move.
        const result = await runMove(project, {sources: ["/src/a.ts"], dest: "/lib", dryRun: true})
        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/lib/a.ts"}])
    })

    it("reports the planned moves and the touched importer files", async () => {
        const project = newProject()
        project.createSourceFile("/src/a.ts", "export const x = 1\n")
        project.createSourceFile("/src/b.ts", "import {x} from \"./a.ts\"\nconst _ = x\n")
        project.createSourceFile("/src/orphan.ts", "export const z = 3\n")
        const result = await runMove(project, {sources: ["/src/a.ts"], dest: "/lib/", dryRun: true})
        assert.deepEqual(result.moves, [{from: "/src/a.ts", to: "/lib/a.ts"}])
        assert.deepEqual([...result.touched].sort(), ["/lib/a.ts", "/src/b.ts"])
    })
})

describe("runMove (on disk)", () => {
    let workdir: string

    before(async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "ts-survey-move-"))
        await fs.mkdir(path.join(workdir, "src"))
        await fs.writeFile(path.join(workdir, "tsconfig.json"), JSON.stringify({
            compilerOptions: {target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, allowImportingTsExtensions: true, noEmit: true},
            include: ["src/**/*"],
        }))
        await fs.writeFile(path.join(workdir, "src/a.ts"), "export const x = 1\n")
        await fs.writeFile(path.join(workdir, "src/b.ts"), "import {x} from \"./a.ts\"\nconst _ = x\n")
    })

    after(async () => {
        await fs.rm(workdir, {recursive: true, force: true})
    })

    it("persists the move and the importer rewrite to disk", async () => {
        const project = new Project({tsConfigFilePath: path.join(workdir, "tsconfig.json")})
        await runMove(project, {sources: [path.join(workdir, "src/a.ts")], dest: path.join(workdir, "lib/"), dryRun: false})

        // Old path is gone, new path holds the original content.
        await assert.rejects(fs.access(path.join(workdir, "src/a.ts")))
        const moved = await fs.readFile(path.join(workdir, "lib/a.ts"), "utf8")
        assert.equal(moved, "export const x = 1\n")
        // Importer's specifier rewritten on disk with `.ts` preserved.
        const importer = await fs.readFile(path.join(workdir, "src/b.ts"), "utf8")
        assert.equal(importer, "import {x} from \"../lib/a.ts\"\nconst _ = x\n")
    })
})

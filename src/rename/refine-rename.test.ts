import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {Project, ts} from "ts-morph"
import type {TSR} from "ts-refine"
import {refineRename} from "./refine-rename.ts"

// rename re-sorts the touched files' imports via organizeImports using the
// surveyed style; pin no-space spacing for deterministic expected text.
const NO_SPACE: TSR.ReportResult = {bracketSpacing: {bracketSpacing: "off"}}

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

describe("refineRename", () => {
    it("renames an exported identifier across declaration, importer, and usage", async () => {
        const project = newProject()
        const libs = project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", "import {funcA} from \"./libs.ts\"\nconst _ = funcA()\n")
        const result = await refineRename(project, {from: "funcA", to: "funcB", file: null, dryRun: true, report: NO_SPACE})
        assert.equal(libs.getFullText(), "export function funcB() { return 1 }\n")
        assert.equal(imp.getFullText(), "import {funcB} from \"./libs.ts\"\nconst _ = funcB()\n")
        assert.deepEqual([...result.touched].sort(), ["/imp.ts", "/libs.ts"])
    })

    it("renames only the imported binding, keeping an importer's alias", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", "import {funcA as fx} from \"./libs.ts\"\nconst _ = fx()\n")
        await refineRename(project, {from: "funcA", to: "funcB", file: null, dryRun: true, report: NO_SPACE})
        assert.equal(imp.getFullText(), "import {funcB as fx} from \"./libs.ts\"\nconst _ = fx()\n")
    })

    it("scopes the lookup to the given file's exports", async () => {
        const project = newProject()
        const a = project.createSourceFile("/a.ts", "export function funcA() { return 1 }\n")
        const b = project.createSourceFile("/b.ts", "export function funcA() { return 2 }\n")
        const ia = project.createSourceFile("/ia.ts", "import {funcA} from \"./a.ts\"\nconst _ = funcA()\n")
        const ib = project.createSourceFile("/ib.ts", "import {funcA} from \"./b.ts\"\nconst _ = funcA()\n")
        await refineRename(project, {from: "funcA", to: "funcB", file: "/a.ts", dryRun: true, report: NO_SPACE})
        assert.equal(a.getFullText(), "export function funcB() { return 1 }\n")
        assert.equal(ia.getFullText(), "import {funcB} from \"./a.ts\"\nconst _ = funcB()\n")
        // b and its importer are untouched.
        assert.equal(b.getFullText(), "export function funcA() { return 2 }\n")
        assert.equal(ib.getFullText(), "import {funcA} from \"./b.ts\"\nconst _ = funcA()\n")
    })

    it("renames a named export without touching a default import's local name", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export default function main() {}\nexport function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", "import main, {funcA} from \"./libs.ts\"\nmain()\nconst _ = funcA()\n")
        await refineRename(project, {from: "funcA", to: "funcB", file: null, dryRun: true, report: NO_SPACE})
        assert.equal(imp.getFullText(), "import main, {funcB} from \"./libs.ts\"\nmain()\nconst _ = funcB()\n")
    })

    it("refuses when the new name collides with an existing top-level binding", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        project.createSourceFile("/imp.ts", "import {funcA} from \"./libs.ts\"\nconst funcB = () => null\nfuncA()\nfuncB()\n")
        await assert.rejects(refineRename(project, {from: "funcA", to: "funcB", file: null, dryRun: true, report: NO_SPACE}), /already exists/)
    })

    it("never touches files that do not reference the symbol", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        project.createSourceFile("/imp.ts", "import {funcA} from \"./libs.ts\"\nconst _ = funcA()\n")
        const other = project.createSourceFile("/other.ts", "export const z = 3\n")
        const result = await refineRename(project, {from: "funcA", to: "funcB", file: null, dryRun: true, report: NO_SPACE})
        assert.ok(!result.touched.includes("/other.ts"))
        assert.equal(other.getFullText(), "export const z = 3\n")
    })

    it("errors when the name is exported from multiple places without a file", async () => {
        const project = newProject()
        project.createSourceFile("/a.ts", "export function funcA() { return 1 }\n")
        project.createSourceFile("/b.ts", "export function funcA() { return 2 }\n")
        await assert.rejects(refineRename(project, {from: "funcA", to: "funcB", file: null, dryRun: true, report: NO_SPACE}), /multiple places/)
    })

    it("errors when the identifier is not exported", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        await assert.rejects(refineRename(project, {from: "nope", to: "funcB", file: null, dryRun: true, report: NO_SPACE}), /no exported identifier/)
    })

    it("rejects an invalid target identifier and a no-op rename", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        await assert.rejects(refineRename(project, {from: "funcA", to: "1bad", file: null, dryRun: true, report: NO_SPACE}), /valid identifier/)
        await assert.rejects(refineRename(project, {from: "funcA", to: "funcA", file: null, dryRun: true, report: NO_SPACE}), /same/)
    })

    it("re-sorts the touched file's imports after the rename", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export const aaa = 1\nexport const mmm = 2\n")
        const imp = project.createSourceFile("/imp.ts", "import {aaa, mmm} from \"./libs.ts\"\nconst _ = aaa + mmm\n")
        await refineRename(project, {from: "aaa", to: "zzz", file: null, dryRun: true, report: NO_SPACE})
        // aaa -> zzz pushes it past mmm, so organizeImports re-sorts the
        // named specifiers to {mmm, zzz}.
        assert.equal(imp.getFullText(), "import {mmm, zzz} from \"./libs.ts\"\nconst _ = zzz + mmm\n")
    })
})

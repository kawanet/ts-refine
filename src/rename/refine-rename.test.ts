import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import ts from "typescript"
import {Project} from "../bridge/bridge.ts"
import {initInMemoryProject} from "../common/init-project.ts"
import {refineRename} from "./refine-rename.ts"

function newProject(): Project {
    return initInMemoryProject({
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowImportingTsExtensions: true,
    })
}

const log = {write: (): void => undefined}

describe("refineRename", () => {
    it("renames an exported identifier across declaration, importer, and usage", async () => {
        const project = newProject()
        const libs = project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", 'import {funcA} from "./libs.ts"\nconst _ = funcA()\n')
        const result = await refineRename({project, log, from: "funcA", to: "funcB", dryRun: true})
        assert.equal(libs.getFullText(), "export function funcB() { return 1 }\n")
        assert.equal(imp.getFullText(), 'import {funcB} from "./libs.ts"\nconst _ = funcB()\n')
        assert.deepEqual([...result.touched].sort(), ["/imp.ts", "/libs.ts"])
    })

    it("renames with the LS defaults when format is omitted", async () => {
        const project = newProject()
        const libs = project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", 'import {funcA} from "./libs.ts"\nconst _ = funcA()\n')

        // No `format`: re-sorts touched imports with the TS language service defaults.
        const result = await refineRename({project, log, from: "funcA", to: "funcB", dryRun: true})

        assert.equal(libs.getFullText(), "export function funcB() { return 1 }\n")
        assert.match(imp.getFullText(), /import \{ ?funcB ?\} from "\.\/libs\.ts"/)
        assert.match(imp.getFullText(), /const _ = funcB\(\)/)
        assert.deepEqual([...result.touched].sort(), ["/imp.ts", "/libs.ts"])
    })

    it("renames only the imported binding, keeping an importer's alias", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", 'import {funcA as fx} from "./libs.ts"\nconst _ = fx()\n')
        await refineRename({project, log, from: "funcA", to: "funcB", dryRun: true})
        assert.equal(imp.getFullText(), 'import {funcB as fx} from "./libs.ts"\nconst _ = fx()\n')
    })

    it("scopes the lookup to the given file's exports", async () => {
        const project = newProject()
        const a = project.createSourceFile("/a.ts", "export function funcA() { return 1 }\n")
        const b = project.createSourceFile("/b.ts", "export function funcA() { return 2 }\n")
        const ia = project.createSourceFile("/ia.ts", 'import {funcA} from "./a.ts"\nconst _ = funcA()\n')
        const ib = project.createSourceFile("/ib.ts", 'import {funcA} from "./b.ts"\nconst _ = funcA()\n')
        await refineRename({project, log, from: "funcA", to: "funcB", file: "/a.ts", dryRun: true})
        assert.equal(a.getFullText(), "export function funcB() { return 1 }\n")
        assert.equal(ia.getFullText(), 'import {funcB} from "./a.ts"\nconst _ = funcB()\n')

        // b and its importer are untouched.
        assert.equal(b.getFullText(), "export function funcA() { return 2 }\n")
        assert.equal(ib.getFullText(), 'import {funcA} from "./b.ts"\nconst _ = funcA()\n')
    })

    it("renames a named export without touching a default import's local name", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export default function main() {}\nexport function funcA() { return 1 }\n")
        const imp = project.createSourceFile("/imp.ts", 'import main, {funcA} from "./libs.ts"\nmain()\nconst _ = funcA()\n')
        await refineRename({project, log, from: "funcA", to: "funcB", dryRun: true})
        assert.equal(imp.getFullText(), 'import main, {funcB} from "./libs.ts"\nmain()\nconst _ = funcB()\n')
    })

    it("refuses when the new name collides with an existing top-level binding", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        project.createSourceFile("/imp.ts", 'import {funcA} from "./libs.ts"\nconst funcB = () => null\nfuncA()\nfuncB()\n')
        await assert.rejects(refineRename({project, log, from: "funcA", to: "funcB", dryRun: true}), /already exists/)
    })

    it("never touches files that do not reference the symbol", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        project.createSourceFile("/imp.ts", 'import {funcA} from "./libs.ts"\nconst _ = funcA()\n')
        const other = project.createSourceFile("/other.ts", "export const z = 3\n")
        const result = await refineRename({project, log, from: "funcA", to: "funcB", dryRun: true})
        assert.ok(!result.touched.includes("/other.ts"))
        assert.equal(other.getFullText(), "export const z = 3\n")
    })

    it("errors when the name is exported from multiple places without a file", async () => {
        const project = newProject()
        project.createSourceFile("/a.ts", "export function funcA() { return 1 }\n")
        project.createSourceFile("/b.ts", "export function funcA() { return 2 }\n")
        await assert.rejects(refineRename({project, log, from: "funcA", to: "funcB", dryRun: true}), /multiple places/)
    })

    it("errors when the identifier is not exported", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        await assert.rejects(refineRename({project, log, from: "nope", to: "funcB", dryRun: true}), /no in-project identifier/)
    })

    it("rejects an invalid target identifier and a no-op rename", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")
        await assert.rejects(refineRename({project, log, from: "funcA", to: "1bad", dryRun: true}), /valid identifier/)
        await assert.rejects(refineRename({project, log, from: "funcA", to: "funcA", dryRun: true}), /same/)
    })

    it("re-sorts the touched file's imports after the rename", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export const aaa = 1\nexport const mmm = 2\n")
        const imp = project.createSourceFile("/imp.ts", 'import {aaa, mmm} from "./libs.ts"\nconst _ = aaa + mmm\n')
        await refineRename({project, log, from: "aaa", to: "zzz", dryRun: true})

        // aaa -> zzz pushes it past mmm, so organizeImports re-sorts the
        // named specifiers to {mmm, zzz}.
        assert.equal(imp.getFullText(), 'import {mmm, zzz} from "./libs.ts"\nconst _ = zzz + mmm\n')
    })

    it("renames a namespace member and its qualified references", async () => {
        const project = newProject()
        const types = project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {\n        x: number\n    }\n}\n")
        const c = project.createSourceFile("/c.ts", 'import type {NS} from "./types.ts"\nconst _: NS.A = {x: 1}\n')
        await refineRename({project, log, from: "NS.A", to: "NS.B", dryRun: true})
        assert.match(types.getFullText(), /interface B {/)
        assert.doesNotMatch(types.getFullText(), /interface A {/)

        // The qualified reference follows the member rename.
        assert.match(c.getFullText(), /const _: NS\.B =/)
    })

    it("refuses a cross-namespace rename", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {}\n}\n")
        await assert.rejects(refineRename({project, log, from: "NS.A", to: "Other.A", dryRun: true}), /same container/)
    })

    it("refuses moving a namespace member to the top level", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {}\n}\n")
        await assert.rejects(refineRename({project, log, from: "NS.A", to: "A", dryRun: true}), /same container/)
    })

    it("refuses when the target member name already exists in the namespace", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {}\n    interface B {}\n}\n")
        await assert.rejects(refineRename({project, log, from: "NS.A", to: "NS.B", dryRun: true}), /already exists/)
    })

    it("errors when the namespace member is not found", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {}\n}\n")
        await assert.rejects(refineRename({project, log, from: "NS.Nope", to: "NS.X", dryRun: true}), /no in-project identifier/)
    })

    it("finds a member declared in a later merged namespace block", async () => {
        const project = newProject()

        // Two `namespace NS {}` blocks in one file; the target is in the second.
        const types = project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {}\n}\nexport declare namespace NS {\n    interface C {}\n}\n")
        const c = project.createSourceFile("/c.ts", 'import type {NS} from "./types.ts"\nconst _: NS.C = {}\n')
        await refineRename({project, log, from: "NS.C", to: "NS.D", dryRun: true})
        assert.match(types.getFullText(), /interface D {}/)
        assert.match(c.getFullText(), /const _: NS\.D =/)
    })

    it("detects a target-name collision in another file of a merged namespace", async () => {
        const project = newProject()
        project.createSourceFile("/a.ts", "export declare namespace NS {\n    interface A {}\n}\n")
        project.createSourceFile("/b.ts", "export declare namespace NS {\n    interface B {}\n}\n")

        // Scoped to a.ts, but `NS.B` already exists in b.ts (same merged namespace).
        await assert.rejects(refineRename({project, log, from: "NS.A", to: "NS.B", file: "/a.ts", dryRun: true}), /already exists/)
    })

    it("renames every block of a merged-interface member (file-scoped)", async () => {
        const project = newProject()

        // `interface A` is declared in two merged NS blocks — one symbol.
        const types = project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface A {\n        x: number\n    }\n}\nexport declare namespace NS {\n    interface A {\n        y: number\n    }\n}\n")
        await refineRename({project, log, from: "NS.A", to: "NS.B", file: "/types.ts", dryRun: true})
        const text = types.getFullText()
        assert.doesNotMatch(text, /interface A {/)

        // Both merged declarations follow the single symbol's rename.
        assert.equal((text.match(/interface B {/g) ?? []).length, 2)
    })

    it("renames an interface property across its declaration and usages", async () => {
        const project = newProject()
        const types = project.createSourceFile("/types.ts", "export interface Shape {\n    width: number\n}\n")
        const use = project.createSourceFile("/use.ts", 'import type {Shape} from "./types.ts"\nconst s: Shape = {width: 1}\nconsole.log(s.width)\n')
        await refineRename({project, log, from: "Shape.width", to: "Shape.w", dryRun: true})
        assert.match(types.getFullText(), /\bw: number/)
        assert.doesNotMatch(types.getFullText(), /width/)
        assert.match(use.getFullText(), /\{w: 1\}/)
        assert.match(use.getFullText(), /s\.w\b/)
    })

    it("renames a class method on a top-level class", async () => {
        const project = newProject()
        const types = project.createSourceFile("/box.ts", "export class Box {\n    grow(): void {}\n}\n")
        const use = project.createSourceFile("/use.ts", 'import {Box} from "./box.ts"\nnew Box().grow()\n')
        await refineRename({project, log, from: "Box.grow", to: "Box.expand", dryRun: true})
        assert.match(types.getFullText(), /expand\(\): void/)
        assert.match(use.getFullText(), /\.expand\(\)/)
    })

    it("renames a property of a namespace-nested interface", async () => {
        const project = newProject()
        const types = project.createSourceFile("/types.ts", "export declare namespace NS {\n    interface Shape {\n        width: number\n    }\n}\n")
        await refineRename({project, log, from: "NS.Shape.width", to: "NS.Shape.w", dryRun: true})
        assert.match(types.getFullText(), /\bw: number/)
        assert.doesNotMatch(types.getFullText(), /width/)
    })

    it("refuses moving a property to a different container", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export interface Shape {\n    width: number\n}\nexport interface Box {\n    width: number\n}\n")
        await assert.rejects(refineRename({project, log, from: "Shape.width", to: "Box.w", dryRun: true}), /same container/)
    })

    it("refuses when the target property name already exists on the container", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export interface Shape {\n    width: number\n    w: number\n}\n")
        await assert.rejects(refineRename({project, log, from: "Shape.width", to: "Shape.w", dryRun: true}), /already exists/)
    })

    it("errors when the container has no such property", async () => {
        const project = newProject()
        project.createSourceFile("/types.ts", "export interface Shape {\n    width: number\n}\n")
        await assert.rejects(refineRename({project, log, from: "Shape.height", to: "Shape.h", dryRun: true}), /no in-project identifier/)
    })

    it("organizes each edited file in its own surveyed style", async () => {
        const project = newProject()
        project.createSourceFile("/libs.ts", "export function funcA() { return 1 }\n")

        // a.ts already uses spaced braces, b.ts tight — each is surveyed alone, so
        // the post-rename re-sort keeps that file's own brace style.
        const a = project.createSourceFile("/a.ts", 'import { funcA } from "./libs.ts"\nconst _ = funcA()\n')
        const b = project.createSourceFile("/b.ts", 'import {funcA} from "./libs.ts"\nconst _ = funcA()\n')
        await refineRename({project, log, from: "funcA", to: "funcB", dryRun: true})

        assert.equal(a.getFullText(), 'import { funcB } from "./libs.ts"\nconst _ = funcB()\n')
        assert.equal(b.getFullText(), 'import {funcB} from "./libs.ts"\nconst _ = funcB()\n')
    })
})

// Integration tests built off the sample/move-*-ext fixtures. Each
// sample is a one-importer-one-library project in a different
// import-extension era; we copy it to a tmpdir and verify refineMove
// rewrites the import to the new path while keeping that era's
// extension style untouched.

import {strict as assert} from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {refineMove} from "./refine-move.ts"

const SAMPLE_ROOT = path.resolve(import.meta.dirname, "../../sample")

async function copySampleTo(name: string, dest: string): Promise<void> {
    await fs.cp(path.join(SAMPLE_ROOT, name), dest, {recursive: true})
}

async function withSampleCopy(name: string, fn: (workdir: string) => Promise<void>): Promise<void> {
    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), `ts-refine-${name}-`))
    try {
        await copySampleTo(name, workdir)
        await fn(workdir)
    } finally {
        await fs.rm(workdir, {recursive: true, force: true})
    }
}

const log = {write: () => {}}

describe("refineMove against sample fixtures (one era per sample)", () => {
    it("sample/move-ts-ext: keeps the explicit `.ts` extension", async () => {
        await withSampleCopy("move-ts-ext", async (workdir) => {
            const project = new Project({tsConfigFilePath: path.join(workdir, "tsconfig.json")})
            await refineMove(project, {log, sources: [path.join(workdir, "src/lib.ts")], dest: path.join(workdir, "src/util/"), dryRun: false, report: {}})
            const cli = await fs.readFile(path.join(workdir, "src/cli.ts"), "utf8")
            assert.ok(cli.includes('from "./util/lib.ts"'), `cli.ts should reference ./util/lib.ts; got:\n${cli}`)
        })
    })

    it("sample/move-js-ext: keeps the emit-style `.js` extension", async () => {
        await withSampleCopy("move-js-ext", async (workdir) => {
            const project = new Project({tsConfigFilePath: path.join(workdir, "tsconfig.json")})
            await refineMove(project, {log, sources: [path.join(workdir, "src/lib.ts")], dest: path.join(workdir, "src/util/"), dryRun: false, report: {}})
            const cli = await fs.readFile(path.join(workdir, "src/cli.ts"), "utf8")
            assert.ok(cli.includes('from "./util/lib.js"'), `cli.ts should reference ./util/lib.js; got:\n${cli}`)
        })
    })

    it("sample/move-no-ext: keeps the legacy no-extension style", async () => {
        await withSampleCopy("move-no-ext", async (workdir) => {
            const project = new Project({tsConfigFilePath: path.join(workdir, "tsconfig.json")})
            await refineMove(project, {log, sources: [path.join(workdir, "src/lib.ts")], dest: path.join(workdir, "src/util/"), dryRun: false, report: {}})
            const cli = await fs.readFile(path.join(workdir, "src/cli.ts"), "utf8")
            assert.ok(cli.includes('from "./util/lib"'), `cli.ts should reference ./util/lib; got:\n${cli}`)
            // And explicitly does NOT add `.ts` / `.js`.
            assert.ok(!cli.includes("./util/lib.ts"), `cli.ts should not gain .ts; got:\n${cli}`)
            assert.ok(!cli.includes("./util/lib.js"), `cli.ts should not gain .js; got:\n${cli}`)
        })
    })
})

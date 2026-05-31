// organize-imports coverage retargeted at refineFormat. The {A} style test
// pins the outcome via `--bracket-spacing off`; the old action
// hard-coded it.

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {refineFormat} from "./refine-format.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")
const INDEX = path.resolve(import.meta.dirname, "../../sample/basic/src/index.ts")

const log = {write: () => {}}

describe("refineFormat (organize-imports path, dry-run, sample/basic)", () => {
    it("alphabetises imports in-memory without touching disk", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})

        // Confirm the fixture starts with imports in non-canonical order so that
        // organizeImports actually has something to do.
        const before = project.getSourceFile(INDEX)!.getFullText()
        assert.ok(before.indexOf("./used.js") < before.indexOf("./partial.js"), "fixture should start with ./used.js before ./partial.js")

        await refineFormat(project, {log, dryRun: true, paths: [], report: {}})

        const after = project.getSourceFile(INDEX)!.getFullText()
        const pPos = after.indexOf("./partial.js")
        const uPos = after.indexOf("./used.js")
        assert.ok(pPos !== -1 && uPos !== -1, "both imports must be preserved")
        assert.ok(pPos < uPos, "after organize, ./partial.js must precede ./used.js")
    })

    it("uses braces without surrounding spaces (`{A}` style) when bracket-spacing off is in effect", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        // Old action hard-coded brace-spacing off; refineFormat drives it via
        // the merged settings, so pin the override here.
        await refineFormat(project, {log, dryRun: true, paths: [], report: {}, bracketSpacing: "off"})

        const text = project.getSourceFile(INDEX)!.getFullText()
        // `{ usedConst,` with a leading space would indicate brace-spacing on.
        assert.ok(/import\s*\{usedConst/.test(text), `expected {A} style; got: ${text}`)
    })
})

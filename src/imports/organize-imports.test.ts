// organize-imports coverage for refineImports against the sample/basic project.
// The {A} style test pins the outcome via a `bracketSpacing: "off"` style;
// sorting and brace style both come from the settings refineImports hands the
// organize pass.

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {refineImports} from "./refine-imports.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")
const INDEX = path.resolve(import.meta.dirname, "../../sample/basic/src/index.ts")

const log = {write: () => {}}

describe("refineImports (dry-run, sample/basic)", () => {
    it("alphabetises imports in-memory without touching disk", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)

        // Confirm the fixture starts with imports in non-canonical order so that
        // organizeImports actually has something to do.
        const before = project.getSourceFile(INDEX)!.getFullText()
        assert.ok(before.indexOf("./used.js") < before.indexOf("./partial.js"), "fixture should start with ./used.js before ./partial.js")

        await refineImports({project, log, dryRun: true, paths: [], format: {}})

        const after = project.getSourceFile(INDEX)!.getFullText()
        const pPos = after.indexOf("./partial.js")
        const uPos = after.indexOf("./used.js")
        assert.ok(pPos !== -1 && uPos !== -1, "both imports must be preserved")
        assert.ok(pPos < uPos, "after organize, ./partial.js must precede ./used.js")
    })

    it("uses braces without surrounding spaces (`{A}` style) when bracket-spacing off is in effect", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)

        // Brace style is driven by the supplied format settings; pin it off here.
        await refineImports({project, log, dryRun: true, paths: [], format: {bracketSpacing: "off"}})

        const text = project.getSourceFile(INDEX)!.getFullText()

        // `{ usedConst,` with a leading space would indicate brace-spacing on.
        assert.ok(/import\s*\{usedConst/.test(text), `expected {A} style; got: ${text}`)
    })
})

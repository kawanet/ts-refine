// Type-only fixes ride the organize-imports bundle, gated on
// verbatimModuleSyntax/isolatedModules. Under verbatim all three LS fixes run;
// under isolatedModules alone only the export side converts; with neither flag
// the whole bundle is skipped (getCombinedCodeFix would otherwise force a
// per-file semantic pass for nothing). Organizing now lives in refineImports.

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {refineImports} from "../imports/refine-imports.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {applyTypeOnlyFixes} from "./type-only-fixes.ts"

const SAMPLE = path.resolve(import.meta.dirname, "../../sample")
const VERBATIM_TSCONFIG = path.join(SAMPLE, "type-only-mixed/tsconfig.json")
const ISOLATED_TSCONFIG = path.join(SAMPLE, "type-only-isolated/tsconfig.json")
const BASIC_TSCONFIG = path.join(SAMPLE, "basic/tsconfig.json")

function read(project: Project, tsconfig: string, rel: string): string {
    const abs = path.resolve(path.dirname(tsconfig), rel)
    return project.getSourceFile(abs)!.getFullText()
}

const log = {write: (): void => undefined}

describe("applyTypeOnlyFixes via refineImports (verbatimModuleSyntax on)", () => {
    it("fires all three fixes end-to-end without touching disk", async () => {
        const project = initTestProject(VERBATIM_TSCONFIG)

        await refineImports({project, log, dryRun: true, paths: []})

        // convertToTypeOnlyImport: Shape gets an inline `type` marker.
        const consume = read(project, VERBATIM_TSCONFIG, "src/consume.ts")
        assert.match(consume, /import\s*\{\s*type Shape,\s*VERSION\s*\}/, `consume: ${consume}`)

        // convertToTypeOnlyExport: the mixed re-export splits, Shape becomes a
        // `export type` while VERSION stays a value export.
        const reexport = read(project, VERBATIM_TSCONFIG, "src/reexport.ts")
        assert.match(reexport, /export type\s*\{\s*Shape\s*\}/, `reexport: ${reexport}`)
        assert.match(reexport, /export\s*\{\s*VERSION\s*\}/, `reexport: ${reexport}`)

        // splitTypeOnlyImport: the illegal default+named type-only import is
        // split into two declarations, and the original combined form is gone.
        const split = read(project, VERBATIM_TSCONFIG, "src/split.ts")
        assert.match(split, /import type Registry/, `split: ${split}`)
        assert.match(split, /import type\s*\{\s*Shape\s*\}/, `split: ${split}`)
        assert.doesNotMatch(split, /import type Registry\s*,/, `illegal combined form should be removed: ${split}`)
    })
})

describe("applyTypeOnlyFixes via refineImports (isolatedModules only)", () => {
    it("converts the export side but leaves imports (import fix needs verbatim)", async () => {
        const project = initTestProject(ISOLATED_TSCONFIG)

        await refineImports({project, log, dryRun: true, paths: []})

        // The gate lets isolatedModules through; convertToTypeOnlyExport fires.
        const reexport = read(project, ISOLATED_TSCONFIG, "src/reexport.ts")
        assert.match(reexport, /export type\s*\{\s*Shape\s*\}/, `reexport: ${reexport}`)

        // convertToTypeOnlyImport needs verbatimModuleSyntax, so the import
        // keeps Shape as a plain specifier here.
        const consume = read(project, ISOLATED_TSCONFIG, "src/consume.ts")
        assert.doesNotMatch(consume, /type Shape/, `consume should stay unmarked: ${consume}`)
    })
})

describe("applyTypeOnlyFixes (neither flag set)", () => {
    it("skips the bundle entirely and changes nothing", () => {
        const project = initTestProject(BASIC_TSCONFIG)
        for (const sf of project.getSourceFiles()) {
            const before = sf.getFullText()
            applyTypeOnlyFixes(sf, {})
            assert.equal(sf.getFullText(), before, `expected no-op on ${sf.getBaseName()}`)
        }
    })
})

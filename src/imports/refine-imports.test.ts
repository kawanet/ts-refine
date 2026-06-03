import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {initInMemoryTestProject, initTestProject} from "../test-utils/init-test-project.ts"
import {refineImports} from "./refine-imports.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")
const INDEX = path.resolve(import.meta.dirname, "../../sample/basic/src/index.ts")

const log = {write: () => {}}

describe("refineImports", () => {
    it("sorts imports and drops unused ones", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineImports({project, log, dryRun: true, paths: [], format: {}})

        // Assertion only checks the dropped name and surviving import;
        // brace-spacing is not pinned here.
        const text = sf.getFullText()
        assert.match(text, /import \{ ?used ?\}/)
        assert.equal(/unused/.test(text), false)
    })

    it("organizes with the LS defaults when format is omitted", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")

        // No `format`: organizes with the TS language service defaults.
        await refineImports({project, log, dryRun: true, paths: []})

        const text = sf.getFullText()
        assert.match(text, /import \{ ?used ?\}/)
        assert.equal(/unused/.test(text), false)
    })

    it("organizes imports but does not reformat the surrounding text", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const a = 1\nexport const b = 2\n")
        const sf = project.createSourceFile("a.ts", "import {b, a} from './dep.ts'\nconst   x = a+b\n")
        await refineImports({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        const text = sf.getFullText()

        // imports are sorted...
        assert.match(text, /a, b/)

        // ...but formatText never runs: the body keeps its odd spacing and no `;`.
        assert.match(text, /const {3}x = a\+b\n/)
    })

    it("organizes each file in its own style under a per-file resolver", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const a = 1\nexport const b = 2\n")
        const x = project.createSourceFile("x.ts", "import {b, a} from './dep.ts'\nconst   _ = a+b\n")
        const y = project.createSourceFile("y.ts", "import {b, a} from './dep.ts'\nconst   _ = a+b\n")

        // x.ts keeps spaced braces, y.ts keeps tight braces — each its own.
        const format = (file: string): Promise<TSR.FormatStyle> => Promise.resolve(file.includes("x.ts") ? {bracketSpacing: "on"} : {bracketSpacing: "off"})
        await refineImports({project, log, dryRun: true, paths: [], format})

        // imports sorted in each file's own brace style...
        assert.match(x.getFullText(), /import \{ a, b \}/)
        assert.match(y.getFullText(), /import \{a, b\}/)

        // ...and the odd body spacing survives in both (no reformat).
        assert.match(x.getFullText(), /const {3}_ = a\+b\n/)
        assert.match(y.getFullText(), /const {3}_ = a\+b\n/)
    })

    it("dryRun does not call fs.writeFile (in-memory project would error on real-fs writes)", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineImports({project, log, dryRun: true, paths: [], format: {}})

        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.equal(/unused/.test(sf.getFullText()), false)
    })

    it("returns the touched files, and an empty list when nothing changes", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        const changed = await refineImports({project, log, dryRun: true, paths: [], format: {}})
        assert.deepEqual(changed.touched, [sf.getFilePath()])

        // The same pass over the now-organized in-memory state changes nothing.
        const again = await refineImports({project, log, dryRun: true, paths: [], format: {}})
        assert.deepEqual(again.touched, [])
    })
})

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

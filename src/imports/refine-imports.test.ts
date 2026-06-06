import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {refineImports} from "./refine-imports.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")
const INDEX = path.resolve(import.meta.dirname, "../../sample/basic/src/index.ts")

const log = {write: (): void => undefined}

describe("refineImports", () => {
    it("sorts imports and drops unused ones", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineImports({project, log, dryRun: true, paths: []})

        // Assertion only checks the dropped name and surviving import;
        // brace-spacing is not pinned here.
        const text = sf.getFullText()
        assert.match(text, /import \{ ?used ?\}/)
        assert.equal(/unused/.test(text), false)
    })

    it("organizes imports but does not reformat the surrounding text", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("dep.ts", "export const a = 1\nexport const b = 2\n")
        const sf = project.createSourceFile("a.ts", "import {b, a} from './dep.ts'\nconst   x = a+b\n")
        await refineImports({project, log, dryRun: true, paths: []})
        const text = sf.getFullText()

        // imports are sorted...
        assert.match(text, /a, b/)

        // ...but formatText never runs: the body keeps its odd spacing and no `;`.
        assert.match(text, /const {3}x = a\+b\n/)
    })

    it("organizes each file in its own surveyed style", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("dep.ts", "export const a = 1\nexport const b = 2\n")

        // x.ts already uses spaced braces, y.ts tight — each is surveyed alone, so
        // organizing keeps that file's own brace style.
        const x = project.createSourceFile("x.ts", "import { b, a } from './dep.ts'\nconst   _ = a+b\n")
        const y = project.createSourceFile("y.ts", "import {b, a} from './dep.ts'\nconst   _ = a+b\n")
        await refineImports({project, log, dryRun: true, paths: []})

        // imports sorted in each file's own brace style...
        assert.match(x.getFullText(), /import \{ a, b \}/)
        assert.match(y.getFullText(), /import \{a, b\}/)

        // ...and the odd body spacing survives in both (no reformat).
        assert.match(x.getFullText(), /const {3}_ = a\+b\n/)
        assert.match(y.getFullText(), /const {3}_ = a\+b\n/)
    })

    it("reasserts a dropped trailing comma on a multi-line local export, leaving the body alone", async () => {
        const project = initInMemoryProject()
        // A sole, multi-line, local `export {}` (no `from`) with a trailing
        // comma: organizeImports rebuilds the specifier list and drops it, but
        // the per-file survey sees the comma so the self-pass reasserts it. The
        // body array (also multi-line, no comma) must stay untouched.
        const sf = project.createSourceFile("a.ts", "const a = 1\nconst b = 2\nexport {\n    b,\n    a,\n}\nconst arr = [\n    a,\n    b\n]\n")
        await refineImports({project, log, dryRun: true, paths: []})
        const text = sf.getFullText()

        // organizeImports squishes the export elements onto one line (a known,
        // out-of-scope layout quirk); what matters is the trailing comma is back.
        assert.match(text, /export \{\n {4}a, b,\n\}/, "export trailing comma restored after sort")
        assert.match(text, /const arr = \[\n {4}a,\n {4}b\n\]/, "body array left untouched (imports-only scope)")
    })

    it("dryRun does not call fs.writeFile (in-memory project would error on real-fs writes)", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineImports({project, log, dryRun: true, paths: []})

        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.equal(/unused/.test(sf.getFullText()), false)
    })

    it("returns the touched files, and an empty list when nothing changes", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        const changed = await refineImports({project, log, dryRun: true, paths: []})
        assert.deepEqual(changed.touched, [sf.getFilePath()])

        // The same pass over the now-organized in-memory state changes nothing.
        const again = await refineImports({project, log, dryRun: true, paths: []})
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

        await refineImports({project, log, dryRun: true, paths: []})

        const after = project.getSourceFile(INDEX)!.getFullText()
        const pPos = after.indexOf("./partial.js")
        const uPos = after.indexOf("./used.js")
        assert.ok(pPos !== -1 && uPos !== -1, "both imports must be preserved")
        assert.ok(pPos < uPos, "after organize, ./partial.js must precede ./used.js")
    })

    it("keeps the file's own brace style (tight `{A}` here, surveyed per file)", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        await refineImports({project, log, dryRun: true, paths: []})

        const text = project.getSourceFile(INDEX)!.getFullText()

        // index.ts uses tight braces, so the per-file survey keeps them tight.
        assert.ok(/import\s*\{usedConst/.test(text), `expected {A} style; got: ${text}`)
    })
})

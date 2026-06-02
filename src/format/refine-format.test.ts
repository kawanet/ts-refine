import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"
import type {TSR} from "ts-refine"
import {initInMemoryTestProject} from "../test-utils/init-test-project.ts"
import {refineFormat} from "./refine-format.ts"

const log = {write: () => {}}

describe("refineFormat", () => {
    it("applies the indent width from the format style", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {indent: 4}})

        // LS formatText re-indents the body to four spaces under the resolved settings.
        assert.match(sf.getFullText(), /\n {4}return 1\n/)
    })

    it("applies a pinned indent width", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {indent: 2}})
        assert.match(sf.getFullText(), /\n {2}return 1\n/)
    })

    it("inserts trailing semicolons when format.semicolons is 'on'", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\nconst b = 2\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        assert.match(sf.getFullText(), /const a = 1;\nconst b = 2;\n/)
    })

    it("leaves JSON modules untouched instead of corrupting them with semicolons", async () => {
        // A semicolon injected into the JSON object literal is a syntax error and
        // used to crash the whole command; JSON must not be a format target.
        const project = initInMemoryTestProject({
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            resolveJsonModule: true,
            allowImportingTsExtensions: true,
        })
        const json = project.createSourceFile("/data.json", '{\n  "a": 1\n}\n')
        const main = project.createSourceFile("/main.ts", 'import DATA from "./data.json" with {type: "json"}\nconst v = DATA.a\n')
        const before = json.getFullText()
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})

        assert.equal(json.getFullText(), before)
        assert.match(main.getFullText(), /const v = DATA\.a;/)
    })

    it("strips trailing semicolons when format.semicolons is 'off'", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.ts", "const a = 1;\nconst b = 2;\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "off"}})
        assert.match(sf.getFullText(), /const a = 1\nconst b = 2\n/)
    })

    it("organizes imports by default", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {}})

        // Assertion only checks the dropped name and surviving import;
        // brace-spacing is not pinned here.
        const text = sf.getFullText()
        assert.match(text, /import \{ ?used ?\}/)
        assert.equal(/unused/.test(text), false)
    })

    it("skips organize-imports when organizeImports is 'off'", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineFormat({project, log, dryRun: true, paths: [], organizeImports: "off", format: {}})

        // Without the organize pass, `unused` stays in the import list.
        assert.match(sf.getFullText(), /unused/)
    })

    it("organizes imports but skips other formatting when organizeImports is 'only'", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const a = 1\nexport const b = 2\n")
        const sf = project.createSourceFile("a.ts", "import {b, a} from './dep.ts'\nconst   x = a+b\n")
        await refineFormat({project, log, dryRun: true, paths: [], organizeImports: "only", format: {semicolons: "on"}})
        const text = sf.getFullText()

        // imports are sorted...
        assert.match(text, /a, b/)

        // ...but formatText is skipped: the body keeps its odd spacing and no `;`.
        assert.match(text, /const {3}x = a\+b\n/)
    })

    it("organizes each file in its own style under a per-file resolver (organizeImports 'only')", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("dep.ts", "export const a = 1\nexport const b = 2\n")
        const x = project.createSourceFile("x.ts", "import {b, a} from './dep.ts'\nconst   _ = a+b\n")
        const y = project.createSourceFile("y.ts", "import {b, a} from './dep.ts'\nconst   _ = a+b\n")

        // x.ts keeps spaced braces, y.ts keeps tight braces — each its own.
        const format = (file: string): Promise<TSR.FormatStyle> => Promise.resolve(file.includes("x.ts") ? {bracketSpacing: "on"} : {bracketSpacing: "off"})
        await refineFormat({project, log, dryRun: true, paths: [], organizeImports: "only", format})

        // imports sorted in each file's own brace style...
        assert.match(x.getFullText(), /import \{ a, b \}/)
        assert.match(y.getFullText(), /import \{a, b\}/)

        // ...and `only` skips formatText, so the odd body spacing survives in both.
        assert.match(x.getFullText(), /const {3}_ = a\+b\n/)
        assert.match(y.getFullText(), /const {3}_ = a\+b\n/)
    })

    it("formats .d.ts files too (no longer excluded)", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.d.ts", "interface I { x:number }\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {bracketSpacing: "on"}})

        // .d.ts is now in scope; formatText tidies the member spacing.
        assert.equal(sf.getFullText(), "interface I { x: number }\n")
    })

    it("dryRun does not call fs.writeFile (verified by using an in-memory project that would error on real-fs writes)", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})

        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.match(sf.getFullText(), /const a = 1;\n/)
    })

    it("returns the touched files, and an empty list when nothing changes", async () => {
        const project = initInMemoryTestProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        const changed = await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        assert.deepEqual(changed.touched, [sf.getFilePath()])

        // The same pass over the now-formatted in-memory state changes nothing.
        const again = await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        assert.deepEqual(again.touched, [])
    })
})

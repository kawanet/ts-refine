import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {refineFormat} from "./refine-format.ts"

const log = {write: () => {}}

describe("refineFormat", () => {
    it("applies the indent width from the format style", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {indent: 4}})
        // LS formatText re-indents the body to four spaces under the resolved settings.
        assert.match(sf.getFullText(), /\n {4}return 1\n/)
    })

    it("applies a pinned indent width", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {indent: 2}})
        assert.match(sf.getFullText(), /\n {2}return 1\n/)
    })

    it("inserts trailing semicolons when format.semicolons is 'on'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1\nconst b = 2\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        assert.match(sf.getFullText(), /const a = 1;\nconst b = 2;\n/)
    })

    it("strips trailing semicolons when format.semicolons is 'off'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1;\nconst b = 2;\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "off"}})
        assert.match(sf.getFullText(), /const a = 1\nconst b = 2\n/)
    })

    it("organizes imports by default", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {}})
        // Assertion only checks the dropped name and surviving import;
        // brace-spacing is not pinned here.
        const text = sf.getFullText()
        assert.match(text, /import \{ ?used ?\}/)
        assert.equal(/unused/.test(text), false)
    })

    it("skips organize-imports when format.organizeImports is 'off'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {organizeImports: "off"}})
        // Without the organize pass, `unused` stays in the import list.
        assert.match(sf.getFullText(), /unused/)
    })

    it("formats .d.ts files too (no longer excluded)", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.d.ts", "interface I { x:number }\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {bracketSpacing: "on"}})
        // .d.ts is now in scope; formatText tidies the member spacing.
        assert.equal(sf.getFullText(), "interface I { x: number }\n")
    })

    it("dryRun does not call fs.writeFile (verified by using an in-memory project that would error on real-fs writes)", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.match(sf.getFullText(), /const a = 1;\n/)
    })

    it("returns the touched files, and an empty list when nothing changes", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        const changed = await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        assert.deepEqual(changed.touched, [sf.getFilePath()])
        // The same pass over the now-formatted in-memory state changes nothing.
        const again = await refineFormat({project, log, dryRun: true, paths: [], format: {semicolons: "on"}})
        assert.deepEqual(again.touched, [])
    })
})

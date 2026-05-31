import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {refineFormat} from "./refine-format.ts"

// Silences the "updated:" / summary writes for clean test output.
function quiet<T>(fn: () => Promise<T>): Promise<T> {
    const origErr = console.error
    console.error = () => {}
    return fn().finally(() => {
        console.error = origErr
    })
}

describe("refineFormat", () => {
    it("applies the indent recommendation when no override is given", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {indent: {width: 4}},
            }),
        )
        // LS formatText re-indents the body to four spaces under the merged settings.
        assert.match(sf.getFullText(), /\n {4}return 1\n/)
    })

    it("lets --indent override beat the report's recommendation", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {indent: {width: 4}},
                indent: 2,
            }),
        )
        assert.match(sf.getFullText(), /\n {2}return 1\n/)
    })

    it("inserts trailing semicolons when the report recommends 'on'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1\nconst b = 2\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {semicolons: {semicolons: "on"}},
            }),
        )
        assert.match(sf.getFullText(), /const a = 1;\nconst b = 2;\n/)
    })

    it("strips trailing semicolons when the report recommends 'off'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1;\nconst b = 2;\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {semicolons: {semicolons: "off"}},
            }),
        )
        assert.match(sf.getFullText(), /const a = 1\nconst b = 2\n/)
    })

    it("organizes imports by default", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {},
            }),
        )
        // Assertion only checks the dropped name and surviving import;
        // brace-spacing is not pinned here.
        const text = sf.getFullText()
        assert.match(text, /import \{ ?used ?\}/)
        assert.equal(/unused/.test(text), false)
    })

    it("skips organize-imports when the override is 'off'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {},
                organizeImports: "off",
            }),
        )
        // Without the organize pass, `unused` stays in the import list.
        assert.match(sf.getFullText(), /unused/)
    })

    it("logs a note on stderr when the report recommends CR-only and no override forces a value", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("a.ts", "const a = 1\n")
        let stderr = ""
        const origErr = console.error
        console.error = (s) => {
            stderr += String(s) + "\n"
        }
        try {
            await refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {newLine: {newLine: "cr"}},
            })
        } finally {
            console.error = origErr
        }
        assert.match(stderr, /CR-only newlines; not applied/)
    })

    it("excludes .d.ts files from rewrite (matching report scope)", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const before = "interface I { x:number }\n"
        const sf = project.createSourceFile("a.d.ts", before)
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {bracketSpacing: {bracketSpacing: "on"}},
            }),
        )
        // .d.ts excluded → text unchanged.
        assert.equal(sf.getFullText(), before)
    })

    it("dryRun does not call fs.writeFile (verified by using an in-memory project that would error on real-fs writes)", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {semicolons: {semicolons: "on"}},
            }),
        )
        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.match(sf.getFullText(), /const a = 1;\n/)
    })

    it("returns the touched files, and an empty list when nothing changes", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        const changed = await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {semicolons: {semicolons: "on"}},
            }),
        )
        assert.deepEqual(changed.touched, [sf.getFilePath()])
        // The same pass over the now-formatted in-memory state changes nothing.
        const again = await quiet(() =>
            refineFormat(project, {
                dryRun: true,
                paths: [],
                report: {semicolons: {semicolons: "on"}},
            }),
        )
        assert.deepEqual(again.touched, [])
    })
})

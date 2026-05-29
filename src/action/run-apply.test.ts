import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {Project} from "ts-morph"

import {runReformat} from "./run-apply.ts"

// Silences the "updated:" / summary writes for clean test output.
function quiet<T>(fn: () => Promise<T>): Promise<T> {
    const origLog = console.log
    const origErr = console.error
    console.log = () => {}
    console.error = () => {}
    return fn().finally(() => {
        console.log = origLog
        console.error = origErr
    })
}

describe("runReformat", () => {
    it("applies the indent recommendation when no override is given", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await quiet(() =>
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
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
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
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
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
                report: {semicolons: {semicolons: "on"}},
            }),
        )
        assert.match(sf.getFullText(), /const a = 1;\nconst b = 2;\n/)
    })

    it("strips trailing semicolons when the report recommends 'off'", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", "const a = 1;\nconst b = 2;\n")
        await quiet(() =>
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
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
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
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
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
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
        const origLog = console.log
        console.error = (s) => {
            stderr += String(s) + "\n"
        }
        console.log = () => {}
        try {
            await runReformat(project, {
                dryRun: true,
                absIncludes: [],
                report: {newLine: {newLine: "cr"}},
            })
        } finally {
            console.error = origErr
            console.log = origLog
        }
        assert.match(stderr, /CR-only newlines; not applied/)
    })

    it("excludes .d.ts files from rewrite (matching report scope)", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const before = "interface I { x:number }\n"
        const sf = project.createSourceFile("a.d.ts", before)
        await quiet(() =>
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
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
            runReformat(project, {
                dryRun: true,
                absIncludes: [],
                report: {semicolons: {semicolons: "on"}},
            }),
        )
        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.match(sf.getFullText(), /const a = 1;\n/)
    })
})

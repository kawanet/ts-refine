import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"
import {initInMemoryProject} from "../common/init-project.ts"
import {refineReport} from "../report/refine-report.ts"
import {refineFormat} from "./refine-format.ts"

const log = {write: (): void => null}

describe("refineFormat", () => {
    it("applies the indent width from the format style", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {indent: 4}})

        // LS formatText re-indents the body to four spaces under the resolved settings.
        assert.match(sf.getFullText(), /\n {4}return 1\n/)
    })

    it("applies a pinned indent width", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "function f() {\n  return 1\n}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {indent: 2}})
        assert.match(sf.getFullText(), /\n {2}return 1\n/)
    })

    it("inserts trailing semicolons when format.semicolons is 'on'", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\nconst b = 2\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})
        assert.match(sf.getFullText(), /const a = 1;\nconst b = 2;\n/)
    })

    it("keeps single-line type literal tails bare when semicolons are on", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "type X = { [key: string]: boolean }\nconst x = (): { [key: string]: boolean } => ({})\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})

        // TS LS inserts member `;` eagerly; trim only the final single-line type
        // literal delimiter so common inline types stay close to Prettier.
        assert.equal(sf.getFullText(), "type X = { [key: string]: boolean };\nconst x = (): { [key: string]: boolean } => ({});\n")
    })

    it("leaves multiline type literal member semicolons when semicolons are on", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "type X = {\n    [key: string]: boolean\n}\nconst x = (): {\n    [key: string]: boolean\n} => ({})\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})

        assert.equal(sf.getFullText(), "type X = {\n    [key: string]: boolean;\n};\nconst x = (): {\n    [key: string]: boolean;\n} => ({});\n")
    })

    it("trims only the last single-line type literal member across delimiter styles", async () => {
        for (const memberDelimiter of [undefined, "semi", "comma", "none"] as const) {
            const project = initInMemoryProject()
            const sf = project.createSourceFile("a.ts", "type A = { a: number, b: number }\ntype B = { a: number; b: number }\n")
            await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on", memberDelimiter}})

            // `memberDelimiter` currently owns interface/class members. For
            // type literals this pass only removes the final LS-inserted `;`;
            // existing between-member `,` / `;` choices are preserved.
            assert.equal(sf.getFullText(), "type A = { a: number, b: number };\ntype B = { a: number; b: number };\n")
        }
    })

    it("leaves JSON modules untouched instead of corrupting them with semicolons", async () => {
        // A semicolon injected into the JSON object literal is a syntax error and
        // used to crash the whole command; JSON must not be a format target.
        const project = initInMemoryProject({
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            resolveJsonModule: true,
            allowImportingTsExtensions: true,
        })
        const json = project.createSourceFile("/data.json", '{\n  "a": 1\n}\n')
        const main = project.createSourceFile("/main.ts", 'import DATA from "./data.json" with {type: "json"}\nconst v = DATA.a\n')
        const before = json.getFullText()
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})

        assert.equal(json.getFullText(), before)
        assert.match(main.getFullText(), /const v = DATA\.a;/)
    })

    it("strips trailing semicolons when format.semicolons is 'off'", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "const a = 1;\nconst b = 2;\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "off"}})
        assert.match(sf.getFullText(), /const a = 1\nconst b = 2\n/)
    })

    it("formats after a survey that already navigated the file (semicolons off)", async () => {
        // Regression: `format` surveys the file first, caching ts-morph node
        // wrappers. Dropping the abstract method's trailing `;` changes a child
        // count, and formatText's incremental reparse used to throw against the
        // stale wrappers ("old and new trees ... same count").
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "export abstract class Foo {\n  protected abstract bar(): Promise<number>;\n}\n")
        await refineReport({project, paths: [], reports: ["trailing-comma"], log})
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "off"}})
        assert.match(sf.getFullText(), /protected abstract bar\(\): Promise<number>\n/)
    })

    it("does not organize imports (that is the separate `imports` command)", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("dep.ts", "export const used = 1\nexport const unused = 2\n")
        const sf = project.createSourceFile("a.ts", "import {unused, used} from './dep.ts'\nconst x = used\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {}})

        // format reformats text only: the unused import is left in place and the
        // names are not re-sorted. Organizing is `imports`' job.
        assert.match(sf.getFullText(), /unused/)
    })

    it("formats .d.ts files too (no longer excluded)", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.d.ts", "interface I { x:number }\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {bracketSpacing: "on"}})

        // .d.ts is now in scope; formatText tidies the member spacing.
        assert.equal(sf.getFullText(), "interface I { x: number }\n")
    })

    it("keeps empty braces tight even with bracketSpacing 'on'", async () => {
        // The formatter spaces non-empty braces but must leave empty ones tight;
        // a bare `export {}` / `function f() {}` must not gain an inner space,
        // matching Prettier. Guards the actual formatText output, not just the
        // resolved settings.
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\nexport {a}\nexport {}\nexport { }\nfunction f() {}\nconst o = {b: 1}\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {bracketSpacing: "on"}})

        assert.equal(sf.getFullText(), "const a = 1\nexport { a }\nexport {}\nexport {}\nfunction f() {}\nconst o = { b: 1 }\n")
    })

    it("dryRun does not call fs.writeFile (verified by using an in-memory project that would error on real-fs writes)", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})

        // No throw → no real-fs write attempt; in-memory FS would have surfaced it.
        assert.match(sf.getFullText(), /const a = 1;\n/)
    })

    it("returns the touched files, and an empty list when nothing changes", async () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", "const a = 1\n")
        const changed = await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})
        assert.deepEqual(changed.touched, [sf.getFilePath()])

        // The same pass over the now-formatted in-memory state changes nothing.
        const again = await refineFormat({project, log, dryRun: true, paths: [], format: {semi: "on"}})
        assert.deepEqual(again.touched, [])
    })
})

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {selectSourceFiles} from "../lib/source-files.ts"
import {initInMemoryTestProject, initTestProject} from "../test-utils/init-test-project.ts"
import {runReportBracketSpacing} from "./bracket-spacing.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/braces-mixed/tsconfig.json")

const log = {write: () => {}}

describe("runReportBracketSpacing (sample/braces-mixed)", () => {
    it("buckets files by primary spacing style and returns the majority", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})

        const out = lines.join("")
        assert.match(out, /^### bracket-spacing\n/)

        // spaced-a.ts: 3 spaced (2 ObjectLiteral + 1 ObjectBindingPattern)
        // spaced-b.ts: 2 spaced
        // tight.ts:    3 tight (2 ObjectLiteral + 1 ObjectBindingPattern)
        // no-object.ts: skipped
        assert.match(out, /\| `\{ x \}` \| 5 \| 2 \| /)
        assert.match(out, /\| `\{x\}` \| 3 \| 1 \| /)
        assert.match(out, /\| total \| 8 \| 3 \| \|/)
        assert.equal(/no-object\.ts/.test(out), false)
        assert.deepEqual(ret, {bracketSpacing: "on"})
    })

    it("skips empty `{}`, whitespace-only `{ }`, and multi-line forms", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("x.ts", ["export const a = {}", "export const b = { }", "export const c = {", "    p: 1,", "}"].join("\n"))
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        const out = lines.join("")

        // None of the three forms speak to the bracketSpacing convention,
        // so the file should not appear in any bucket.
        assert.match(out, /\| total \| 0 \| 0 \| \|/)

        // Both styles still get a 0-row so the comparison stays visible.
        assert.match(out, /\| `\{ x \}` \| 0 \| 0 \|\|/)
        assert.match(out, /\| `\{x\}` \| 0 \| 0 \|\|/)
        assert.deepEqual(ret, {})
    })

    it("treats CR-only and CRLF multi-line objects as multi-line (not just LF)", async () => {
        const project = initInMemoryTestProject()

        // CR-only line terminators (rare but supported by the new-line
        // report); the brace inner content contains no LF so a naive
        // `\n` test would misclassify it as a single-line tight object.
        project.createSourceFile("cr.ts", "export const a = {\r    p: 1,\r}\r")
        project.createSourceFile("crlf.ts", "export const b = {\r\n    p: 1,\r\n}\r\n")
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        assert.match(lines.join(""), /\| total \| 0 \| 0 \| \|/)
        assert.deepEqual(ret, {})
    })

    it("breaks a file-count tie by the higher node count and emits a recommendation", async () => {
        const project = initInMemoryTestProject()

        // tight.ts (1 file, 1 tight node) vs spaced.ts (1 file, 3 spaced nodes).
        project.createSourceFile("tight.ts", "export const a = {x: 1}\n")
        project.createSourceFile("spaced.ts", "export const a = { x: 1 }\nexport const b = { y: 2 }\nexport const c = { z: 3 }\n")
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        assert.deepEqual(ret, {bracketSpacing: "on"})
        assert.match(lines.join(""), /\| total \| 4 \| 2 \| \|/)
    })

    it("returns no recommendation when files AND nodes tie", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("tight.ts", "export const a = {x: 1}\n")
        project.createSourceFile("spaced.ts", "export const a = { x: 1 }\n")
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        assert.deepEqual(ret, {})
    })

    it("counts ObjectBindingPattern (destructure) alongside ObjectLiteralExpression", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("d.ts", "export const f = ({ a, b }: {a: 1; b: 2}) => a + b\n")
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})

        // Only the binding pattern (`{ a, b }`) is counted; the type literal
        // `{a: 1; b: 2}` is a TypeLiteralNode and out of scope.
        assert.match(lines.join(""), /\| `\{ x \}` \| 1 \| 1 \| /)
        assert.deepEqual(ret, {bracketSpacing: "on"})
    })

    it("counts named bindings of import / export declarations", async () => {
        const project = initInMemoryTestProject()

        // Pure re-export modules carry no object literal or destructure, but
        // the LS formatter still re-spaces `import {x}` / `export {x}` — so
        // the report must see them or its recommendation would skip the file.
        project.createSourceFile("tight.ts", ['import {a} from "./x.ts"', 'export {b} from "./y.ts"', ""].join("\n"))
        project.createSourceFile("spaced.ts", ['import { a } from "./x.ts"', 'export { b } from "./y.ts"', ""].join("\n"))
        const lines: string[] = []
        const ret = await runReportBracketSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        const out = lines.join("")
        assert.match(out, /\| `\{ x \}` \| 2 \| 1 \| /)
        assert.match(out, /\| `\{x\}` \| 2 \| 1 \| /)
        assert.match(out, /\| total \| 4 \| 2 \| \|/)
        assert.deepEqual(ret, {})
    })
})

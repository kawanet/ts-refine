import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {runReportFunctionSpacing} from "./function-spacing.ts"

const log = {write: (): void => undefined}

describe("runReportFunctionSpacing", () => {
    it("recommends the majority style for each spacing axis", async () => {
        const project = initInMemoryProject()
        project.createSourceFile(
            "prettier.ts",
            [
                "const a = function () { return 1 }",
                "function named() { return 1 }",
                "class C { method() { return 1 } }",
                "if (a) { named() }",
                "try { named() } catch (e) { named() }",
                "do { named() } while (a)",
                "",
            ].join("\n"),
        )
        project.createSourceFile(
            "compact.ts",
            [
                "const a = function() { return 1 }",
                "function named () { return 1 }",
                "class C { method () { return 1 } }",
                "if(a) { named() }",
                "try { named() } catch(e) { named() }",
                "do { named() } while(a)",
                "",
            ].join("\n"),
        )
        project.createSourceFile(
            "more-prettier.ts",
            [
                "const a = function () { return 1 }",
                "function named() { return 1 }",
                "while (a) { break }",
                "",
            ].join("\n"),
        )

        const lines: string[] = []
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        const out = lines.join("")

        assert.deepEqual(ret, {anonymousFunctionSpacing: "on", namedFunctionSpacing: "off", controlKeywordSpacing: "on"})
        assert.match(out, /^### --anonymous-function-spacing on --named-function-spacing off --control-keyword-spacing on/m)
        assert.match(out, /anonymous function.*compact\.ts/)
        assert.match(out, /named function.*3 \| 2/)
        assert.match(out, /control keyword.*4 \| 2/)
    })

    it("ignores constructors and async arrows because these axes do not control them", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("x.ts", ["class C { constructor () {} }", "const f = async()=>1", "const g = async () => 1", ""].join("\n"))
        const lines: string[] = []
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})

        assert.deepEqual(ret, {})
        assert.match(lines.join(""), /\| anonymous function \| total \| 0 \| 0 \| *\|/)
        assert.match(lines.join(""), /\| named function \| total \| 0 \| 0 \| *\|/)
        assert.match(lines.join(""), /\| control keyword \| total \| 0 \| 0 \| *\|/)
    })

    it("counts anonymous declarations but skips generic anonymous functions", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("default.ts", ["export default function () { return 1 }", ""].join("\n"))
        project.createSourceFile("generic.ts", ["const f = function<T>() { return 1 }", ""].join("\n"))
        const lines: string[] = []
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})

        assert.deepEqual(ret, {anonymousFunctionSpacing: "on"})
        assert.match(lines.join(""), /\| anonymous function \| `function\(\)` \| 0 \| 0 \| *\|/)
        assert.match(lines.join(""), /\| anonymous function \| total \| 1 \| 1 \| *\|/)
    })

    it("uses the do-while keyword token, not while substrings in the body or condition", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("spaced.ts", 'do { const word = "while" } while (meanwhile)\n')
        project.createSourceFile("compact.ts", 'do { const word = "while" } while(meanwhile)\n')
        const lines: string[] = []
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        const out = lines.join("")

        assert.deepEqual(ret, {})
        assert.match(out, /\| control keyword \| `if \(x\)` \| 1 \| 1 \| spaced\.ts \|/)
        assert.match(out, /\| control keyword \| `if\(x\)` \| 1 \| 1 \| compact\.ts \|/)
    })

    it("skips comments and real tokens between the keyword/name and paren", async () => {
        const project = initInMemoryProject()
        project.createSourceFile(
            "x.ts",
            [
                "const a = function /* gap */ () { return 1 }",
                "function named /* gap */ () { return 1 }",
                "if /* gap */ (a) { named() }",
                "for await (const item of items) { named() }",
                "",
            ].join("\n"),
        )
        const lines: string[] = []
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})

        assert.deepEqual(ret, {})
        assert.match(lines.join(""), /\| anonymous function \| total \| 0 \| 0 \| *\|/)
        assert.match(lines.join(""), /\| named function \| total \| 0 \| 0 \| *\|/)
        assert.match(lines.join(""), /\| control keyword \| total \| 0 \| 0 \| *\|/)
    })

    it("returns no recommendation when files and nodes tie on an axis", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("tight.ts", "const a = function() { return 1 }\n")
        project.createSourceFile("spaced.ts", "const a = function () { return 1 }\n")

        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        assert.deepEqual(ret, {})
    })
})

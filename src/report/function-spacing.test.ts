import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {renderSections} from "../common/write-report-sections.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {omitSections} from "../test-utils/omit-sections.ts"
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

        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        const out = renderSections(ret.sections ?? [])

        assert.deepEqual(omitSections(ret), {functionKeywordSpacing: "on", functionParenSpacing: "off", controlKeywordSpacing: "on"})
        assert.match(out, /^### --function-keyword-spacing on --function-paren-spacing off --control-keyword-spacing on/m)
        assert.match(out, /function keyword.*compact\.ts/)
        assert.match(out, /function paren.*3 \| 2/)
        assert.match(out, /control keyword.*4 \| 2/)
    })

    it("ignores constructors and async arrows because these axes do not control them", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("x.ts", ["class C { constructor () {} }", "const f = async()=>1", "const g = async () => 1", ""].join("\n"))
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})

        assert.deepEqual(omitSections(ret), {})
        assert.match(renderSections(ret.sections ?? []), /\| function keyword \| total \| 0 \| 0 \| *\|/)
        assert.match(renderSections(ret.sections ?? []), /\| function paren \| total \| 0 \| 0 \| *\|/)
        assert.match(renderSections(ret.sections ?? []), /\| control keyword \| total \| 0 \| 0 \| *\|/)
    })

    it("counts anonymous declarations on keyword spacing and generic anonymous functions on paren spacing", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("default.ts", ["export default function () { return 1 }", ""].join("\n"))
        project.createSourceFile("generic.ts", ["const f = function<T>() { return 1 }", ""].join("\n"))
        project.createSourceFile("generic-spaced.ts", ["const g = function <T extends Array<string>> () { return 1 }", ""].join("\n"))
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        const out = renderSections(ret.sections ?? [])

        assert.deepEqual(omitSections(ret), {functionKeywordSpacing: "on"})
        assert.match(out, /\| function keyword \| `function\(\)` \| 0 \| 0 \| *\|/)
        assert.match(out, /\| function keyword \| total \| 1 \| 1 \| *\|/)
        assert.match(out, /\| function paren \| `function foo\(\)` \| 1 \| 1 \| generic\.ts \|/)
        assert.match(out, /\| function paren \| `function foo \(\)` \| 1 \| 1 \| generic-spaced\.ts \|/)
    })

    it("counts anonymous generator spacing after the asterisk", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("spaced-generator.ts", "const f = function* () { yield 1 }\n")
        project.createSourceFile("compact-generator.ts", "const f = function*() { yield 1 }\n")
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        const out = renderSections(ret.sections ?? [])

        assert.deepEqual(omitSections(ret), {})
        assert.match(out, /\| function keyword \| `function \(\)` \| 1 \| 1 \| spaced-generator\.ts \|/)
        assert.match(out, /\| function keyword \| `function\(\)` \| 1 \| 1 \| compact-generator\.ts \|/)
    })

    it("uses the do-while keyword token, not while substrings in the body or condition", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("spaced.ts", 'do { const word = "while" } while (meanwhile)\n')
        project.createSourceFile("compact.ts", 'do { const word = "while" } while(meanwhile)\n')
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        const out = renderSections(ret.sections ?? [])

        assert.deepEqual(omitSections(ret), {})
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
        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})

        assert.deepEqual(omitSections(ret), {})
        assert.match(renderSections(ret.sections ?? []), /\| function keyword \| total \| 0 \| 0 \| *\|/)
        assert.match(renderSections(ret.sections ?? []), /\| function paren \| total \| 0 \| 0 \| *\|/)
        assert.match(renderSections(ret.sections ?? []), /\| control keyword \| total \| 0 \| 0 \| *\|/)
    })

    it("returns no recommendation when files and nodes tie on an axis", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("tight.ts", "const a = function() { return 1 }\n")
        project.createSourceFile("spaced.ts", "const a = function () { return 1 }\n")

        const ret = await runReportFunctionSpacing({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        assert.deepEqual(omitSections(ret), {})
    })
})

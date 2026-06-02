import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {selectSourceFiles} from "../lib/source-files.ts"
import {initInMemoryTestProject, initTestProject} from "../test-utils/init-test-project.ts"
import {runReportNewLine} from "./new-line.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/newlines-mixed/tsconfig.json")

const log = {write: () => {}}

describe("runReportNewLine (sample/newlines-mixed)", () => {
    it("buckets files by primary terminator and returns the majority", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const lines: string[] = []
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})

        const out = lines.join("")
        assert.match(out, /^### new-line\n/)

        // Two LF files + one CRLF file + one empty (skipped).
        assert.match(out, /\| `\\n` \| 6 \| 2 \| /)
        assert.match(out, /\| `\\r\\n` \| 3 \| 1 \| /)
        assert.match(out, /\| total \| 9 \| 3 \| \|/)

        // Recommendation comes back as action params; LF wins on file count.
        assert.deepEqual(ret, {newLine: "lf"})
    })

    it("counts \\r\\n as one CRLF rather than \\r + \\n", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("x.ts", "const a = 1\r\nconst b = 2\r\n")
        const lines: string[] = []
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        const out = lines.join("")
        assert.match(out, /\| `\\r\\n` \| 2 \| 1 \| /)
        assert.equal(/`\\n`/.test(out), false)
        assert.equal(/`\\r`/.test(out.split("| total")[0] ?? ""), false)
        assert.deepEqual(ret, {newLine: "crlf"})
    })

    it("breaks a file-count tie by the higher terminator count and emits a recommendation", async () => {
        const project = initInMemoryTestProject()

        // 1 LF file with 5 LFs vs 1 CRLF file with 1 CRLF — tied on files,
        // LF wins on terminator count.
        project.createSourceFile("lf.ts", "a\nb\nc\nd\ne\n")
        project.createSourceFile("crlf.ts", "x\r\n")
        const lines: string[] = []
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        assert.deepEqual(ret, {newLine: "lf"})
    })

    it("returns an empty partial when files AND terminator counts both tie", async () => {
        const project = initInMemoryTestProject()
        project.createSourceFile("lf.ts", "const a = 1\n")
        project.createSourceFile("crlf.ts", "const b = 1\r\n")
        const lines: string[] = []
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}})
        assert.deepEqual(ret, {})
        assert.match(lines.join(""), /\| total \| 2 \| 2 \| \|/)
    })
})

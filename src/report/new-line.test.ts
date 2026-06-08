import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {renderSections} from "../common/write-report-sections.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {omitSections} from "../test-utils/omit-sections.ts"
import {runReportNewLine} from "./new-line.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/newlines-mixed/tsconfig.json")

const log = {write: (): void => undefined}

describe("runReportNewLine (sample/newlines-mixed)", () => {
    it("buckets files by primary terminator and returns the majority", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log})

        const out = renderSections(ret.sections ?? [])
        assert.match(out, /^### new-line\n/)

        // Two LF files + one CRLF file + one empty (skipped).
        assert.match(out, /\| `\\n` \| 6 \| 2 \| /)
        assert.match(out, /\| `\\r\\n` \| 3 \| 1 \| /)
        assert.match(out, /\| total \| 9 \| 3 \| *\|/)

        // Recommendation comes back as action params; LF wins on file count.
        assert.deepEqual(omitSections(ret), {newLine: "lf"})
    })

    it("counts \\r\\n as one CRLF rather than \\r + \\n", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("x.ts", "const a = 1\r\nconst b = 2\r\n")
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        const out = renderSections(ret.sections ?? [])
        assert.match(out, /\| `\\r\\n` \| 2 \| 1 \| /)
        assert.equal(/`\\n`/.test(out), false)
        assert.equal(/`\\r`/.test(out.split("| total")[0] ?? ""), false)
        assert.deepEqual(omitSections(ret), {newLine: "crlf"})
    })

    it("breaks a file-count tie by the higher terminator count and emits a recommendation", async () => {
        const project = initInMemoryProject()

        // 1 LF file with 5 LFs vs 1 CRLF file with 1 CRLF — tied on files,
        // LF wins on terminator count.
        project.createSourceFile("lf.ts", "a\nb\nc\nd\ne\n")
        project.createSourceFile("crlf.ts", "x\r\n")
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        assert.deepEqual(omitSections(ret), {newLine: "lf"})
    })

    it("throws on a CR-only file (lone \\r, no \\n)", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("cr.ts", "const a = 1\rconst b = 2\r")
        await assert.rejects(
            runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log}),
            /CR-only line endings are not supported/,
        )
    })

    it("returns an empty partial when files AND terminator counts both tie", async () => {
        const project = initInMemoryProject()
        project.createSourceFile("lf.ts", "const a = 1\n")
        project.createSourceFile("crlf.ts", "const b = 1\r\n")
        const ret = await runReportNewLine({sourceFiles: selectSourceFiles(project, {paths: []}), log})
        assert.deepEqual(omitSections(ret), {})
        assert.match(renderSections(ret.sections ?? []), /\| total \| 2 \| 2 \| *\|/)
    })
})

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {runReportUnusedExports} from "./unused-exports.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

describe("runReportUnusedExports (sample/basic)", () => {
    it("flags deleted-and-unexported declarations and skips externally-used ones", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        const lines: string[] = []
        await runReportUnusedExports(project, {stream: {write: (l) => lines.push(l)}, absIncludes: [], absExcludes: []})

        const out = lines.join("")
        assert.match(out, /^### unused-exports\n/)
        // deadConst and DeadType from unused.ts have no references at all.
        assert.match(out, /unused\.ts \| 1 \| deadConst \| const \| delete/)
        assert.match(out, /unused\.ts \| 2 \| DeadType \| type \| delete/)
        // onlyInFile is used inside partial.ts but never externally → unexport.
        assert.match(out, /partial\.ts \| \d+ \| onlyInFile \| const \| unexport/)
        // externallyUsed / usedConst / usedFn are imported by index.ts → not reported.
        assert.equal(/externallyUsed/.test(out), false)
        assert.equal(/usedConst/.test(out), false)
        assert.equal(/usedFn/.test(out), false)
    })
})

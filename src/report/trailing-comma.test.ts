import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {selectSourceFiles} from "../lib/source-files.ts"
import {runReportTrailingComma} from "./trailing-comma.ts"

const log = {write: (): void => undefined}

function run(files: Record<string, string>, importsOnly = false) {
    const project = initInMemoryProject()
    for (const [name, src] of Object.entries(files)) project.createSourceFile(name, src)
    const lines: string[] = []
    return runReportTrailingComma({sourceFiles: selectSourceFiles(project, {paths: []}), log, output: {write: (l) => lines.push(l)}, importsOnly}).then((ret) => ({ret, out: lines.join("")}))
}

describe("runReportTrailingComma", () => {
    it("votes per multi-line list and returns the majority", async () => {
        const {ret, out} = await run({
            "on.ts": "const a = [\n    1,\n    2,\n]\nconst b = {\n    x: 1,\n}\n",
            "off.ts": "const c = [\n    1,\n    2\n]\n",
        })
        assert.match(out, /^### --trailing-comma/)
        assert.match(out, /\| trailing `,` \| 2 \| 1 \| /)
        assert.match(out, /\| no trailing `,` \| 1 \| 1 \| /)
        assert.deepEqual(ret, {trailingComma: "on"})
    })

    it("ignores single-line lists (a trailing comma there is not a layout choice)", async () => {
        const {ret, out} = await run({"x.ts": "const a = [1, 2,]\nconst b = [3, 4]\n"})
        assert.match(out, /\| total \| 0 \| 0 \| *\|/)
        assert.deepEqual(ret, {})
    })

    it("does not count a comma inside a trailing comment as a trailing comma", async () => {
        // The list has no real trailing comma; the comment comma must not
        // flip the vote to `on`.
        const {ret} = await run({"x.ts": "const a = [\n    1 // a, b\n]\n"})
        assert.deepEqual(ret, {trailingComma: "off"})
    })

    it("never counts a spread / rest last element", async () => {
        const {ret} = await run({"x.ts": "const a = [\n    ...xs\n]\nfunction f(\n    ...args\n) {}\n"})
        assert.deepEqual(ret, {})
    })

    it("excludes angle-bracket and interface / type-literal member lists", async () => {
        const {ret} = await run({
            "x.ts": "class Foo<\n    A,\n    B\n> {}\ninterface I {\n    a: number,\n    b: string\n}\n",
        })
        assert.deepEqual(ret, {})
    })

    it("with importsOnly, counts only import/export named bindings", async () => {
        const {ret, out} = await run(
            {
                // Tight body list (no trailing comma) that importsOnly must
                // exclude; only the import binding's trailing comma should vote.
                "a.ts": "import {\n    a,\n    b,\n} from './m.ts'\nconst arr = [\n    1,\n    2\n]\nconst _ = [a, b, arr]\n",
            },
            true,
        )
        assert.match(out, /\| trailing `,` \| 1 \| 1 \| /)
        assert.match(out, /\| total \| 1 \| 1 \| *\|/)
        assert.deepEqual(ret, {trailingComma: "on"})
    })
})

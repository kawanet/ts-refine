import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {writeInspectFile} from "./write-inspect-file.ts"

function capture(file: TSR.InspectFile): string {
    let out = ""
    writeInspectFile(file, {write: (s) => (out += s)})
    return out
}

describe("writeInspectFile", () => {
    it("emits the file heading and the exports table", () => {
        const out = capture({
            file: "src/a.ts",
            exports: [
                {line: 3, kind: "const", name: "x", importers: 2, example: "src/cli.ts"},
                {line: 8, kind: "type", name: "T", importers: 0, example: undefined},
            ],
        })
        assert.match(out, /^## src\/a\.ts\n/)
        assert.match(out, /^### exports$/m)
        assert.match(out, /\| 3 \| const \| x \| 2 \| src\/cli\.ts \|/)

        // Unused exports show **unused** in the example column.
        assert.match(out, /\| 8 \| type \| T \| 0 \| \*\*unused\*\* \|/)
    })

    it("emits an `(no exports)` line when the file exports nothing", () => {
        const out = capture({file: "src/index.ts", exports: []})
        assert.match(out, /### exports\n\n\(no exports\)\n/)
    })

    it("skips the exports section when the inspector did not run", () => {
        const out = capture({file: "src/a.ts"})
        assert.match(out, /^## src\/a\.ts\n/)
        assert.equal(/### exports/.test(out), false)
    })

    it("emits the importers table with the comma-joined kinds and names", () => {
        const out = capture({
            file: "src/a.ts",
            importers: [
                {file: "src/cli.ts", kinds: ["value"], names: ["x", "y"]},
                {file: "src/loader.ts", kinds: ["dynamic"], names: ["(dynamic)"]},
                {file: "src/mixed.ts", kinds: ["type", "value"], names: ["type T", "x"]},
            ],
        })
        assert.match(out, /^### importers$/m)
        assert.match(out, /^\| importer \| kind \| names \|/m)
        assert.match(out, /\| src\/cli\.ts \| value \| x, y \|/)
        assert.match(out, /\| src\/loader\.ts \| dynamic \| \(dynamic\) \|/)
        assert.match(out, /\| src\/mixed\.ts \| type, value \| type T, x \|/)
    })

    it("emits an `(no importers)` line when nothing imports the file", () => {
        const out = capture({file: "src/index.ts", importers: []})
        assert.match(out, /### importers\n\n\(no importers\)\n/)
    })
})

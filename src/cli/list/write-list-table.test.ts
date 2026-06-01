import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TSR} from "ts-refine"
import {writeListTable} from "./write-list-table.ts"

const ENTRIES: TSR.ListEntry[] = [
    {file: "entry.ts", exports: 0, unused: 0, importers: 0},
    {file: "lib.ts", exports: 3, unused: 0, importers: 2},
    {file: "stale.ts", exports: 2, unused: 1, importers: 1},
]

describe("writeListTable", () => {
    it("renders the four-column table with a trailing blank line", () => {
        let out = ""
        writeListTable(ENTRIES, {write: (s) => (out += s)})
        assert.match(out, /^\| file \| exports \| unused \| importers \|\n\| --- \| --- \| --- \| --- \|\n/)
        assert.match(out, /\| stale\.ts \| 2 \| 1 \| 1 \|\n/)
        assert.match(out, /\n$/)
    })
})

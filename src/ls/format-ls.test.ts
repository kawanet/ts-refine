import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {LsEntry} from "@kawanet/ts-survey"
import {filterLsEntries, writeLsTable} from "./format-ls.ts"

const ENTRIES: LsEntry[] = [
    {file: "entry.ts", exports: 0, unused: 0, importers: 0},
    {file: "lib.ts", exports: 3, unused: 0, importers: 2},
    {file: "stale.ts", exports: 2, unused: 1, importers: 1},
]

describe("filterLsEntries", () => {
    it("returns every entry when no filter is active", () => {
        assert.equal(filterLsEntries(ENTRIES, {noExports: false, noImporters: false, unusedExports: false}).length, 3)
    })

    it("--no-exports keeps only files that export nothing", () => {
        const r = filterLsEntries(ENTRIES, {noExports: true, noImporters: false, unusedExports: false})
        assert.deepEqual(r.map((e) => e.file), ["entry.ts"])
    })

    it("--no-importers keeps only files no one imports", () => {
        const r = filterLsEntries(ENTRIES, {noExports: false, noImporters: true, unusedExports: false})
        assert.deepEqual(r.map((e) => e.file), ["entry.ts"])
    })

    it("--unused-exports keeps only files with unused exports", () => {
        const r = filterLsEntries(ENTRIES, {noExports: false, noImporters: false, unusedExports: true})
        assert.deepEqual(r.map((e) => e.file), ["stale.ts"])
    })

    it("combines multiple filters with OR (union of candidates)", () => {
        const r = filterLsEntries(ENTRIES, {noExports: true, noImporters: false, unusedExports: true})
        assert.deepEqual(r.map((e) => e.file), ["entry.ts", "stale.ts"])
    })
})

describe("writeLsTable", () => {
    it("renders the four-column table with a trailing blank line", () => {
        let out = ""
        writeLsTable(ENTRIES, {write: (s) => (out += s)})
        assert.match(out, /^\| file \| exports \| unused \| importers \|\n\| --- \| --- \| --- \| --- \|\n/)
        assert.match(out, /\| stale\.ts \| 2 \| 1 \| 1 \|\n/)
        assert.match(out, /\n$/)
    })
})

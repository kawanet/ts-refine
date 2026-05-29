// Renders LsEntry rows as a Markdown table, and applies the `ls` filters.
// The caller writes any `### ...` header; this writes just the table.

import type {LsEntry, RunReportsOpts} from "@kawanet/ts-survey"

// Local alias for readability — not exported.
type Writer = RunReportsOpts["stream"]

export interface LsFilters {
    noExports: boolean
    noImporters: boolean
    unusedExports: boolean
}

// OR semantics: with no filter active every entry passes; otherwise an
// entry passes if it matches any active filter — the union of cleanup
// candidates (no exports, no importers, or has unused exports).
export function filterLsEntries(entries: LsEntry[], f: LsFilters): LsEntry[] {
    if (!f.noExports && !f.noImporters && !f.unusedExports) return entries
    return entries.filter((e) => (f.noExports && e.exports === 0) || (f.noImporters && e.importers === 0) || (f.unusedExports && e.unused > 0))
}

export function writeLsTable(entries: LsEntry[], stream: Writer): void {
    stream.write("| file | exports | unused | importers |\n")
    stream.write("| --- | --- | --- | --- |\n")
    for (const e of entries) {
        stream.write(`| ${e.file} | ${e.exports} | ${e.unused} | ${e.importers} |\n`)
    }
    stream.write("\n")
}

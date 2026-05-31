// Renders ListEntry rows as a Markdown table, and applies the `list` filters.
// The caller writes any `### ...` header; this writes just the table.

import type {TSR} from "ts-refine"

// Local alias for readability — not exported.
type Writer = TSR.ReportOpts["stream"]

interface ListFilters {
    noExports: boolean
    noImporters: boolean
    unusedExports: boolean
}

// OR semantics: with no filter active every entry passes; otherwise an
// entry passes if it matches any active filter — the union of cleanup
// candidates (no exports, no importers, or has unused exports).
export function filterListEntries(entries: TSR.ListEntry[], f: ListFilters): TSR.ListEntry[] {
    if (!f.noExports && !f.noImporters && !f.unusedExports) return entries
    return entries.filter((e) => (f.noExports && e.exports === 0) || (f.noImporters && e.importers === 0) || (f.unusedExports && e.unused > 0))
}

export function writeListTable(entries: TSR.ListEntry[], stream: Writer): void {
    stream.write("| file | exports | unused | importers |\n")
    stream.write("| --- | --- | --- | --- |\n")
    for (const e of entries) {
        stream.write(`| ${e.file} | ${e.exports} | ${e.unused} | ${e.importers} |\n`)
    }
    stream.write("\n")
}

// Renders ListEntry rows as a Markdown table. Entries arrive already filtered
// by refineList; the caller writes any `### ...` header, this writes just the
// table.

import type {TSR} from "ts-refine"

export function writeListTable(entries: TSR.ListEntry[], output: TSR.Writer): void {
    output.write("| file | exports | unused | importers |\n")
    output.write("| --- | --- | --- | --- |\n")
    for (const e of entries) {
        output.write(`| ${e.file} | ${e.exports} | ${e.unused} | ${e.importers} |\n`)
    }
    output.write("\n")
}

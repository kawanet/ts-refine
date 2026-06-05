// Renders one InspectFile as Markdown: a `## <file>` heading, then any
// inspector sections that ran. The caller decides the stream; this writes
// just one file's block (the CLI calls it per InspectFile entry).

import type {TSR} from "ts-refine"

export function writeInspectFile(file: TSR.InspectFile, output: TSR.Writer): void {
    output.write(`## ${file.file}\n`)
    output.write("\n")
    if (file.exports != null) writeExports(file.exports, output)
    if (file.importers != null) writeImporters(file.importers, output)
}

function writeExports(rows: TSR.InspectExport[], output: TSR.Writer): void {
    output.write("### exports\n")
    output.write("\n")
    if (rows.length === 0) {
        output.write("(no exports)\n\n")
        return
    }
    output.write("| line | kind | name | importers | example |\n")
    output.write("| --- | --- | --- | --- | --- |\n")
    for (const e of rows) {
        // example column shows the representative importer when used, or
        // **unused** when nothing outside the file references this export.
        const example = e.example ?? "**unused**"
        output.write(`| ${e.line} | ${e.kind} | ${e.name} | ${e.importers} | ${example} |\n`)
    }
    output.write("\n")
}

function writeImporters(rows: TSR.InspectImporter[], output: TSR.Writer): void {
    output.write("### importers\n")
    output.write("\n")
    if (rows.length === 0) {
        output.write("(no importers)\n\n")
        return
    }
    output.write("| importer | kind | names |\n")
    output.write("| --- | --- | --- |\n")
    for (const r of rows) {
        output.write(`| ${r.file} | ${r.kinds.join(", ")} | ${r.names.join(", ")} |\n`)
    }
    output.write("\n")
}

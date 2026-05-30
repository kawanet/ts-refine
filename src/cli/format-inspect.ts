// Renders one InspectFile as Markdown: a `## <file>` heading, then any
// inspector sections that ran. The caller decides the stream; this writes
// just one file's block (the CLI calls it per InspectFile entry).

import type {TSR} from "ts-refine"

// Local alias for readability — not exported.
type Writer = TSR.ReportOpts["stream"]

export function writeInspectFile(file: TSR.InspectFile, stream: Writer): void {
    stream.write(`## ${file.file}\n`)
    stream.write("\n")
    if (file.exports !== undefined) writeExports(file.exports, stream)
    if (file.importers !== undefined) writeImporters(file.importers, stream)
}

function writeExports(rows: TSR.InspectExport[], stream: Writer): void {
    stream.write("### exports\n")
    stream.write("\n")
    if (rows.length === 0) {
        stream.write("(no exports)\n\n")
        return
    }
    stream.write("| line | kind | name | importers | example |\n")
    stream.write("| --- | --- | --- | --- | --- |\n")
    for (const e of rows) {
        // example column shows the representative importer when used, or
        // **unused** when nothing outside the file references this export.
        const example = e.example ?? "**unused**"
        stream.write(`| ${e.line} | ${e.kind} | ${e.name} | ${e.importers} | ${example} |\n`)
    }
    stream.write("\n")
}

function writeImporters(rows: TSR.InspectImporter[], stream: Writer): void {
    stream.write("### importers\n")
    stream.write("\n")
    if (rows.length === 0) {
        stream.write("(no importers)\n\n")
        return
    }
    stream.write("| importer | kind | names |\n")
    stream.write("| --- | --- | --- |\n")
    for (const r of rows) {
        stream.write(`| ${r.file} | ${r.kinds.join(", ")} | ${r.names.join(", ")} |\n`)
    }
    stream.write("\n")
}

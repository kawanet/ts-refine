// Render the data a report returns into the survey Markdown. The library hands
// back `sections` (title + raw table cells) per report; turning those into
// Markdown is a CLI concern, so the same data can later drive `--emit csv`/`json`.

import type {TSR} from "ts-refine"

// ReportResult slots in registry order (the kebab reportNames, camelCased), so
// the survey prints sections in the same fixed order the reports run in.
const SECTION_SLOTS = ["semi", "indent", "memberDelimiter", "newLine", "bracketSpacing", "trailingComma", "functionSpacing"] as const

export function writeReportSections(report: TSR.ReportResult, output: TSR.Writer): void {
    for (const slot of SECTION_SLOTS) {
        const sections = report[slot]?.sections
        if (sections) output.write(renderSections(sections))
    }
}

// Pure Markdown for a list of sections, exported so report tests can assert on
// the rendered form of the data they return.
export function renderSections(sections: readonly TSR.Section[]): string {
    return sections.map(renderSection).join("")
}

// `### title` then the table: header row, a `---` separator sized to the header,
// then each data row. A blank line follows so blocks read as separate sections.
function renderSection(section: TSR.Section): string {
    const lines: string[] = []
    if (section.title != null) {
        lines.push(`### ${section.title}`, "")
    }

    const table = section.table
    if (table && table.length > 0) {
        const [header, ...rows] = table
        lines.push(formatRow(header))
        lines.push(formatRow(header.map(() => "---")))
        for (const row of rows) lines.push(formatRow(row))
        lines.push("")
    }

    return lines.map((l) => l + "\n").join("")
}

function formatRow(cells: string[]): string {
    return `| ${cells.join(" | ")} |`
}

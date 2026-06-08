// Render the data a report returns into the survey Markdown. The library hands
// back `sections` (title + raw table cells) per report; turning those into
// Markdown is a CLI concern, so the same data can later drive `--emit csv`/`json`.

import type {TSR} from "ts-refine"

// Each report's sections, in registry order (see report-names.ts). Listed
// explicitly rather than derived from reportNames so a renamed or added slot is
// a type error here, not a silent miss from a camelCase string transform.
export function writeReportSections(report: TSR.ReportResult, output: TSR.Writer): void {
    const o = ({sections}: TSR.ReportSections = {}) => sections && output.write(renderSections(sections))
    o(report.semi)
    o(report.indent)
    o(report.memberDelimiter)
    o(report.newLine)
    o(report.bracketSpacing)
    o(report.trailingComma)
    o(report.functionSpacing)
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

import type {TSR} from "ts-refine"

// ReportResult → FormatStyle. `cr` is read and discarded (see FormatStyle);
// member-separators has no actionable mapping and is dropped too.
export function reportToFormatStyle(report: TSR.ReportResult): TSR.FormatStyle {
    const options: TSR.FormatStyle = {}
    if (report.semicolons?.semicolons) options.semicolons = report.semicolons.semicolons
    if (report.indent?.width !== undefined) options.indent = report.indent.width
    const newLine = report.newLine?.newLine
    if (newLine === "lf" || newLine === "crlf") options.newLine = newLine
    if (report.bracketSpacing?.bracketSpacing) options.bracketSpacing = report.bracketSpacing.bracketSpacing
    return options
}

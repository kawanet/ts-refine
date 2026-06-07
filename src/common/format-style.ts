import type {TSR} from "ts-refine"

// ReportResult → FormatStyle. `cr` is read and discarded (see FormatStyle).
// member-delimiter maps through: `format` applies it via a self-pass, so it
// is an apply target even though it has no LS / Prettier mapping.
export function reportToFormatStyle(report: TSR.ReportResult): TSR.FormatStyle {
    const options: TSR.FormatStyle = {}
    if (report.semi?.semi) options.semi = report.semi.semi
    if (report.indent?.width != null) options.indent = report.indent.width
    const newLine = report.newLine?.newLine
    if (newLine === "lf" || newLine === "crlf") options.newLine = newLine
    if (report.bracketSpacing?.bracketSpacing) options.bracketSpacing = report.bracketSpacing.bracketSpacing
    if (report.memberDelimiter?.delimiter) options.memberDelimiter = report.memberDelimiter.delimiter
    if (report.trailingComma?.trailingComma) options.trailingComma = report.trailingComma.trailingComma
    if (report.functionSpacing?.anonymousFunctionSpacing) options.anonymousFunctionSpacing = report.functionSpacing.anonymousFunctionSpacing
    if (report.functionSpacing?.namedFunctionSpacing) options.namedFunctionSpacing = report.functionSpacing.namedFunctionSpacing
    if (report.functionSpacing?.controlKeywordSpacing) options.controlKeywordSpacing = report.functionSpacing.controlKeywordSpacing
    return options
}

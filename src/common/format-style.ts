import type {TSR} from "ts-refine"

// ReportResult → FormatStyle. member-delimiter maps through: `format` applies
// it via a self-pass, so it is an apply target even though it has no LS /
// Prettier mapping.
export function reportToFormatStyle(report: TSR.ReportResult): TSR.FormatStyle {
    const options: TSR.FormatStyle = {}
    if (report.semi?.semi) options.semi = report.semi.semi
    if (report.indent?.width != null) options.indent = report.indent.width
    if (report.newLine?.newLine) options.newLine = report.newLine.newLine
    if (report.bracketSpacing?.bracketSpacing) options.bracketSpacing = report.bracketSpacing.bracketSpacing
    if (report.memberDelimiter?.delimiter) options.memberDelimiter = report.memberDelimiter.delimiter
    if (report.trailingComma?.trailingComma) options.trailingComma = report.trailingComma.trailingComma
    if (report.functionSpacing?.functionKeywordSpacing) options.functionKeywordSpacing = report.functionSpacing.functionKeywordSpacing
    if (report.functionSpacing?.functionParenSpacing) options.functionParenSpacing = report.functionSpacing.functionParenSpacing
    if (report.functionSpacing?.controlKeywordSpacing) options.controlKeywordSpacing = report.functionSpacing.controlKeywordSpacing
    return options
}

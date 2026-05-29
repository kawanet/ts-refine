// CLI help text. Name lists come from the report / format registries
// so help stays in sync with wired-up entries.

import {formatNames} from "../format/run-format.ts"
import {reportNames} from "../report/report-names.ts"

export function usage(): string {
    return [
        "Usage: ts-survey <command> [options] [files...]",
        "",
        "Commands:",
        "  help                        Show this help (also: no args, -h, --help)",
        "  report [reports...]         Survey the codebase; print Markdown reports",
        "  reformat                    Apply the reports' recommendations to disk",
        "  ls                          List files with export / usage counts",
        "",
        "report (read; the primary mode):",
        "  report                      Run every report and print the survey Markdown",
        "  report --<report>...        Restrict to the named reports (e.g. --semicolons --indent)",
        `                              Known reports: ${reportNames.join(", ")}`,
        "  --output <name>             Suppress Markdown and emit the named output instead",
        `                              Known outputs: ${formatNames.join(", ")}`,
        "",
        "reformat (write; applies the reports' recommendations to disk):",
        "  reformat                    Apply the recommended settings to every file",
        "  --indent <N|tab>            Override indent width or use tabs",
        "  --semicolons on|off         Override semicolon insertion",
        "  --new-line lf|crlf          Override end-of-line",
        "  --bracket-spacing on|off    Override inner-brace spacing",
        "  --organize-imports on|off   Toggle organize-imports (default: on)",
        "  --dry-run                   Print paths instead of writing",
        "",
        "ls (read; file export / usage listing):",
        "  ls                          List every file with export / unused / importer counts",
        "  --no-exports                Only files that export nothing",
        "  --no-importers              Only files no other file imports",
        "  --unused-exports            Only files with unused exports",
        "                              (multiple ls filters combine with OR)",
        "",
        "Project (mirrors `tsc -p`):",
        "  -p, --project <path>        Path to a tsconfig.json or a directory",
        "                              that contains one. Defaults to `-p .`.",
        "",
        "Files (applies to report and reformat):",
        "  [files...]                  Restrict to the given files; globs are allowed,",
        "                              resolved against the tsconfig dir. Default: all.",
    ].join("\n")
}

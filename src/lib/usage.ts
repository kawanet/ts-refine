// CLI help text. Name lists come from the report / format registries
// so help stays in sync with wired-up entries.

import {formatNames} from "../format/run-format.ts"
import {reportNames} from "../report/report-names.ts"

export function usage(): string {
    return [
        "Usage: ts-survey [--report <names>|--format <name>|--apply] [-p tsconfig.json] [options]",
        "",
        "Reports (read; the primary mode):",
        "  (no args)                   Run every report and print the survey Markdown",
        "  --report <names>            Emit Markdown for the named reports (comma-separated or repeat)",
        `                              Known reports: ${reportNames.join(", ")}`,
        "  --format <name>             Suppress Markdown and emit the named format instead",
        `                              Known formats: ${formatNames.join(", ")}`,
        "",
        "Apply (write; applies the reports' recommendations to disk):",
        "  --apply                     Apply the recommended settings to every file",
        "  --indent <N|tab>            Override indent width or use tabs (implies --apply)",
        "  --semicolons on|off         Override semicolon insertion (implies --apply)",
        "  --new-line lf|crlf          Override end-of-line (implies --apply)",
        "  --bracket-spacing on|off    Override inner-brace spacing (implies --apply)",
        "  --organize-imports on|off   Toggle organize-imports under --apply (default: on)",
        "",
        "Project (mirrors `tsc -p`):",
        "  -p, --project <path>        Path to a tsconfig.json or a directory",
        "                              that contains one. Defaults to `-p .`.",
        "",
        "File scope (applies to both):",
        "  --include <glob>            Restrict to files matching the glob",
        "  --exclude <glob>            Skip files matching the glob",
        "",
        "Common:",
        "  --dry-run                   Apply only: print paths instead of writing",
        "  -h, --help                  Show this help",
    ].join("\n")
}

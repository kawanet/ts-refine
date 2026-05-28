// CLI help text. Returned as a string so the caller (cli.ts) can decide
// whether to write it to stdout (--help) or stderr (after an argv error).
// `reportNames` is pulled from the report registry so help stays in sync
// with whatever reports are wired up.

import {reportNames} from "../report/run-reports.ts"

export function usage(): string {
    return [
        "Usage: ts-survey <action(s)|--report> <tsconfig.json> [options]",
        "",
        "Actions (write; multiple can be combined, fixed execution order):",
        "  --organize-imports          Apply the Language Service organizeImports",
        "  --remove-semicolons         Strip trailing `;` from all ASI-eligible statements",
        "  --insert-semicolons         Append trailing `;` to all ASI-eligible statements",
        "                              (--remove-semicolons and --insert-semicolons are mutually exclusive)",
        "",
        "Reports (read; exclusive with actions):",
        "  --report <names>            Emit Markdown reports (comma-separated or repeat)",
        `                              Known reports: ${reportNames.join(", ")}`,
        "",
        "File scope (applies to both):",
        "  --include <glob>            Restrict to files matching the glob",
        "  --exclude <glob>            Skip files matching the glob",
        "",
        "Common:",
        "  --dry-run                   Action only: print paths instead of writing",
        "  -h, --help                  Show this help",
    ].join("\n")
}

// CLI help text. Returned as a string so the caller (cli.ts) can decide
// whether to write it to stdout (--help) or stderr (after an argv error).
// `reportNames` / `formatNames` are pulled from their respective routers
// so help stays in sync with whatever names are wired up.

import {formatNames} from "../format/run-format.ts"
import {reportNames} from "../report/run-reports.ts"

export function usage(): string {
    return [
        "Usage: ts-survey <action(s)|--report> [-p tsconfig.json] [options]",
        "",
        "Actions (write; multiple can be combined, fixed execution order):",
        "  --organize-imports          Apply the Language Service organizeImports",
        "  --indent <N>                Rewrite leading whitespace to N spaces per indent level",
        "  --semicolons on|off         Insert (on) or strip (off) trailing `;` on ASI-eligible statements",
        "",
        "Reports (read; exclusive with actions):",
        "  --report <names>            Emit Markdown reports (comma-separated or repeat)",
        `                              Known reports: ${reportNames.join(", ")}`,
        "  --format <name>             Suppress Markdown and emit the named format instead",
        `                              Known formats: ${formatNames.join(", ")}`,
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
        "  --dry-run                   Action only: print paths instead of writing",
        "  -h, --help                  Show this help",
    ].join("\n")
}

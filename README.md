# ts-refine

[![Node.js CI](https://github.com/kawanet/ts-refine/actions/workflows/nodejs.yml/badge.svg?branch=main)](https://github.com/kawanet/ts-refine/actions/)
[![npm version](https://img.shields.io/npm/v/ts-refine)](https://www.npmjs.com/package/ts-refine)

LS-based semantic refactoring for TypeScript codebases. `ts-refine` conforms
to your codebase's **own** conventions instead of imposing its own: it infers
how your project already writes code, then moves files, renames exports,
rewrites imports, organizes imports, and formats small edits so they blend in.
No config to maintain — the codebase itself is the style guide.

- Built on the TypeScript Language Service (via
  [ts-morph](https://github.com/dsherret/ts-morph)) — the same engine your
  editor uses for import rewriting and formatting.
- Useful when AI coding agents would otherwise reach for grep/sed and miss a
  semantic import, move, or rename edge case.
- Safe, low-friction cleanup after code changes — start with read commands or
  `--dry-run`, then apply.

## Synopsis

```sh
# print usage for every command
npx ts-refine help

# show each file's exports and how they're used
npx ts-refine list

# show only files that reference an identifier
npx ts-refine list --ref funcA

# inspect one file's exports and importers
npx ts-refine inspect src/foo.ts

# move a file; every import of it is rewritten
npx ts-refine move fileA.ts fileB.ts --dry-run

# rename an export across the whole project
npx ts-refine rename --from funcA --to funcB --dry-run

# organize imports: sort, merge, and drop unused declarations
npx ts-refine imports --dry-run

# survey the code style and print recommendations
npx ts-refine report

# apply the surveyed formatting style
npx ts-refine format --dry-run
```

## Install

Requires Node.js >= 22.18.

For one-off use, run it with `npx`:

```sh
npx ts-refine help
```

For reproducible project-local use, install it as a dev dependency:

```sh
npm install --save-dev ts-refine
npx ts-refine help
```

To run it across projects from anywhere, install it globally:

```sh
npm install -g ts-refine
ts-refine help
```

## Commands

| Command  | What it does                                                        |
| -------- | ------------------------------------------------------------------ |
| `help`   | Show usage (also `-h`, `--help`, or no args)                       |
| `list`   | List files with export / unused / importer counts                  |
| `inspect` | Show per-file exports and importer details                        |
| `move`   | Move `.ts` files and rewrite every import that references them      |
| `rename` | Rename an exported identifier and every reference across the project |
| `imports` | Organize imports — sort, merge, and drop unused declarations       |
| `report` | Survey the codebase and print Markdown reports + recommendations   |
| `format` | Apply the surveyed formatting style to disk                        |

Global options may appear on either side of the command:

- `-p, --project <path>` — a `tsconfig.json` or a directory containing one
  (defaults to `-p .`).
- `--dry-run` — for `format` / `imports` / `move` / `rename`, print what would
  change instead of writing.
- `-h, --help` — show usage.

## List

`list` reports each file's export, unused-export, and importer counts; `--ref`
finds every file that references a given symbol. Filters combine with AND.

```sh
# every file with its export / unused / importer counts
npx ts-refine list

# only files that export nothing
npx ts-refine list --no-exports

# only files no other file imports
npx ts-refine list --no-importers

# only files that have unused exports
npx ts-refine list --unused-exports

# only files that reference an identifier, or a dotted a.b / a.b.c
npx ts-refine list --ref funcA
npx ts-refine list --ref nsA.funcB
npx ts-refine list --ref typeA.propB
npx ts-refine list --ref nsA.typeB.propC
```

The `--ref` target may be declared in the project or imported from a dependency.

## Inspect

`inspect` prints per-file analysis — what a file exports and who imports it.
Use it when `list` points at a candidate file and you want the detail before a
move, rename, or deletion.

```sh
# run every inspector on the given file
npx ts-refine inspect src/foo.ts

# only the exports table
npx ts-refine inspect --exports src/foo.ts

# only the importers table
npx ts-refine inspect --importers src/foo.ts
```

## Move

`move` relocates `.ts` files and rewrites every import that references them.

```sh
# move a file; every import of it is rewritten
npx ts-refine move src/old/util.ts src/lib/util.ts

# preview the moves without writing
npx ts-refine move src/old/util.ts src/lib/util.ts --dry-run

# move several files into a directory
npx ts-refine move src/a.ts src/b.ts src/lib/
```

## Rename

`rename` renames an exported identifier and every reference, keeping importer
aliases intact. A dotted name reaches inside a container — a namespace member,
or a property of an interface or class — and `from`/`to` must keep that
container (the member is renamed in place, never moved).

```sh
# rename an export and every reference across the project
npx ts-refine rename --from funcA --to funcB

# preview the rename without writing
npx ts-refine rename --from funcA --to funcB --dry-run

# rename the export from one file when the name isn't unique
npx ts-refine rename --from funcA --to funcB src/lib.ts

# rename a member of a namespace
npx ts-refine rename --from nsA.funcB --to nsA.funcC

# rename a property of an exported interface or class
npx ts-refine rename --from typeA.propB --to typeA.propC

# rename a property of a namespace-nested interface or class
npx ts-refine rename --from nsA.typeB.propC --to nsA.typeB.propD
```

## Imports

`imports` organizes each file's import and export declarations without
reformatting the surrounding code. Each file is sorted by its own surveyed
style, so a project with mixed formatting keeps each file's conventions and
shifts the least — use `format` to unify the surrounding style instead.

```sh
# organize imports across every file
npx ts-refine imports

# preview the changes without writing
npx ts-refine imports --dry-run

# organize only the given files
npx ts-refine imports src/foo.ts src/bar.ts
```

Organizing imports sorts and combines declarations and drops unused ones. Under
`verbatimModuleSyntax` it also adds `type` markers to imports and exports that
are only used as types; `isolatedModules` alone applies this to type-only
re-exports only. Projects with neither flag see no type-only change.

## Report

`report` surveys the code style and prints a recommendation per dimension —
semicolons, indent, member-separators, new-line, bracket-spacing.

```sh
# survey every dimension and print the recommendation tables
npx ts-refine report

# restrict to specific dimensions
npx ts-refine report --semicolons --indent

# emit a .prettierrc from the survey instead of Markdown
npx ts-refine report --emit prettier

# emit a runnable `format` command instead of Markdown
npx ts-refine report --emit ts-refine
```

## Format

`format` rewrites every file's surrounding code to the surveyed conventions.
Organizing imports is the separate `imports` command. Any field can be pinned
instead of following the survey.

```sh
# apply the surveyed formatting style
npx ts-refine format

# preview the changes without writing
npx ts-refine format --dry-run

# report only, exiting non-zero if any file would change (for CI)
npx ts-refine format --check

# pin the indent width (a number, or `tab`)
npx ts-refine format --indent 2

# pin semicolon insertion
npx ts-refine format --semicolons off

# pin the end-of-line
npx ts-refine format --new-line lf

# pin inner-brace spacing
npx ts-refine format --bracket-spacing off
```

## FAQ

- **What is the core value of `ts-refine`?**
  - The value lies in **semantic, graph-aware refactoring**. Unlike text-based
    tools, it understands your code via the TypeScript Language Service. This
    allows it to move files, organize imports, and rename exported symbols
    project-wide with high precision.

- **Does it replace Prettier?**
  - No. Comprehensive style enforcement is typically Prettier's job. While
    `ts-refine` includes a `format` command, its primary goal is to ensure that
    automated edits blend into your existing codebase's inferred style rather
    than providing exhaustive configuration options.

- **Can it delete unused code like Knip?**
  - No. Knip is specialized in finding and removing unused files and
    dependencies. `ts-refine` can help you **find** and **inspect** unused
    exports (via `list` and `inspect`), but it focuses on safely moving and
    renaming the code you keep.

- **Does it require config?**
  - No. `ts-refine` reads your TypeScript project and infers the conventions
    already present in the selected files.

- **What should I try first?**
  - Start with `list`, `report`, or `inspect`. For write commands, use
    `format --dry-run`, `move ... --dry-run`, or `rename ... --dry-run` before
    writing.

- **What does `rename` rename?**
  - Exported identifiers and their references across the project. It is not a
    local-variable rename tool.

- **What happens to import aliases?**
  - Aliases are kept while the exported name and references are updated.

## Links

- https://github.com/kawanet/ts-refine
- https://github.com/kawanet/ts-refine/blob/main/types/ts-refine.d.ts
- https://www.npmjs.com/package/ts-refine

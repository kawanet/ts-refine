# ts-refine

[![Node.js CI](https://github.com/kawanet/ts-refine/actions/workflows/nodejs.yml/badge.svg?branch=main)](https://github.com/kawanet/ts-refine/actions/)
[![npm version](https://img.shields.io/npm/v/ts-refine)](https://www.npmjs.com/package/ts-refine)

Zero-config TypeScript refactoring that conforms to your codebase's **own**
conventions instead of imposing its own. `ts-refine` infers how your project
already writes code, then moves files, renames symbols, organizes imports, and
formats — every edit landing in the style it detected, so it blends in rather
than churning the diff. No `.prettierrc`, no rule config: the codebase is the
spec.

- Built on the TypeScript Language Service (via
  [ts-morph](https://github.com/dsherret/ts-morph)) — the same engine your
  editor uses for import rewriting and formatting.
- Safe, low-friction cleanup after code changes — handy for both humans and AI
  coding agents.

## Install

Requires Node.js >= 22.18.

```sh
npx ts-refine <command> [options] [files...]
```

## Synopsis

```sh
# print usage for every command
npx ts-refine help

# show each file's exports and how they're used
npx ts-refine list

# survey the code style and print recommendations
npx ts-refine report

# apply the surveyed style and organize imports
npx ts-refine format --dry-run

# move a file; every import of it is rewritten
npx ts-refine move fileA.ts fileB.ts --dry-run

# rename an export across the whole project
npx ts-refine rename --from funcA --to funcB --dry-run
```

## Commands

| Command  | What it does                                                        |
| -------- | ------------------------------------------------------------------ |
| `help`   | Show usage (also `-h`, `--help`, or no args)                       |
| `list`   | List files with export / unused / importer counts                  |
| `report` | Survey the codebase and print Markdown reports + recommendations   |
| `format` | Apply the surveyed style to disk and organize imports              |
| `move`   | Move `.ts` files and rewrite every import that references them      |
| `rename` | Rename an exported identifier and every reference across the project |

Global options may appear on either side of the command:

- `-p, --project <path>` — a `tsconfig.json` or a directory containing one
  (defaults to `-p .`).
- `--dry-run` — for `format` / `move` / `rename`, print what would change
  instead of writing.
- `-h, --help` — show usage.

## List

`list` reports each file's export, unused-export, and importer counts. Filters
combine with OR.

```sh
# every file with its export / unused / importer counts
npx ts-refine list

# only files that export nothing
npx ts-refine list --no-exports

# only files no other file imports
npx ts-refine list --no-importers

# only files that have unused exports
npx ts-refine list --unused-exports

# any file matching at least one of the filters
npx ts-refine list --no-exports --no-importers --unused-exports
```

## Report

`report` surveys the code style and prints a recommendation per dimension —
semicolons, indent, member-separators, new-line, bracket-spacing.

```sh
# survey every dimension and print the recommendation tables
npx ts-refine report

# restrict to specific dimensions
npx ts-refine report --semicolons --indent

# emit a .prettierrc from the survey instead of Markdown
npx ts-refine report --output prettier

# emit a runnable `format` command instead of Markdown
npx ts-refine report --output ts-refine
```

## Format

`format` rewrites every file to the surveyed conventions and organizes imports.
Any field can be pinned instead of following the survey.

```sh
# apply the surveyed style and organize imports
npx ts-refine format

# preview the changes without writing
npx ts-refine format --dry-run

# pin the indent width (a number, or `tab`)
npx ts-refine format --indent 2

# pin semicolon insertion
npx ts-refine format --semicolons off

# pin the end-of-line
npx ts-refine format --new-line lf

# pin inner-brace spacing
npx ts-refine format --bracket-spacing off

# skip organizing imports (on by default)
npx ts-refine format --organize-imports off
```

## Move

`move` relocates `.ts` files and rewrites every import that references them.

```sh
# move a file; every import of it is rewritten
npx ts-refine move src/old/util.ts src/lib/util.ts

# move several files into a directory
npx ts-refine move src/a.ts src/b.ts src/lib/

# preview the moves without writing
npx ts-refine move src/old/util.ts src/lib/util.ts --dry-run
```

## Rename

`rename` renames an exported identifier and every reference, keeping importer
aliases intact.

```sh
# rename an export and every reference across the project
npx ts-refine rename --from funcA --to funcB

# scope the lookup to one file when the name isn't unique
npx ts-refine rename src/lib.ts --from funcA --to funcB

# preview the rename without writing
npx ts-refine rename --from funcA --to funcB --dry-run
```

## Inspect

`inspect` prints per-file analysis — what a file exports and who imports it.

```sh
# run every inspector on the given file
npx ts-refine inspect src/foo.ts

# only the exports table
npx ts-refine inspect --exports src/foo.ts

# only the importers table
npx ts-refine inspect --importers src/foo.ts
```

## Why not just Prettier?

Style unification is Prettier's job, and `ts-refine` does not try to replace
it. The value here is the **refactoring** operations that need to understand
your code as a graph — moving a file and rewriting every importer, organizing
imports the way your project already does — done with zero configuration. The
formatter exists mainly so those edits blend into the surrounding file rather
than fighting it.

## License

MIT

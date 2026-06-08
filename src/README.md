# Source Layout

This directory contains the TypeScript sources that are bundled into the
published library and CLI.

## Entry Points

- `index.ts` exports the public library API described by `types/ts-refine.d.ts`;
  it is bundled into `dist/ts-refine.mjs`.
- `cli.ts` is the executable entry point for the `ts-refine` command; it is
  bundled into `dist/ts-refine.cli.mjs`.

## Directories

- `cli/` contains command-line adapters. These modules parse tokens, handle CLI
  IO, and call the library functions.
- `common/` contains code shared by the CLI layer and public API
  implementations. This shared code may be bundled into both outputs.
- `lib/` contains internal helpers shared by the public API implementations.
- `test-utils/` contains helpers used by tests only.
- `src/{subcommand}/` directories, such as `src/report/` and `src/format/`,
  contain the public API implementation for each command-sized feature. Tests
  live beside the implementation files they cover.

In short, `src/cli/{subcommand}/` is the command-line adapter for a
subcommand, while `src/{subcommand}/` is the reusable implementation exported
through the library API. For example, compare `src/cli/report/` with
`src/report/`, or `src/cli/format/` with `src/format/`.

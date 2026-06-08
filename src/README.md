# Source Layout

The `src/` directory contains TypeScript source for the published library and
CLI bundles.

## Entry Points

- `src/index.ts` is the public library entry point for the API declared in
  `types/ts-refine.d.ts`. It is bundled into `dist/ts-refine.mjs`.
- `src/cli.ts` is the `ts-refine` command entry point. It is bundled into
  `dist/ts-refine.cli.mjs`.

## Directories

- `src/cli/` contains CLI implementation for the `ts-refine` command.
- `src/cli/{subcommand}/` directories contain CLI adapters for subcommands
  when needed.
- `src/{subcommand}/` directories, such as `src/report/` and `src/format/`,
  contain the reusable library implementation for each subcommand.
- `src/common/` contains code shared by CLI and library implementations.
- `src/lib/` contains internal library helpers.
- `src/bridge/` contains the in-house compatibility layer over the TypeScript
  compiler and language service — the ts-morph-shaped `Project` / `SourceFile` /
  `Node` surface the rest of `src/` is written against.
- `src/test-utils/` contains shared test helpers.

// Path helpers for the compat layer. The TypeScript APIs we drive work
// exclusively in absolute forward-slash paths, so every path entering a project
// is normalized once here. A single normalizer means a file added as "a\b" and
// later looked up as "a/b" resolves to the same entry.

import path from "node:path"

// Absolute path with forward slashes. Already-absolute inputs keep their root;
// relative inputs resolve against the current working directory, matching how
// the CLI hands us absolute paths.
export function normalizePath(p: string): string {
    return path.resolve(p).replace(/\\/g, "/")
}

// Directory portion of a normalized path.
export function dirOf(p: string): string {
    return normalizePath(path.dirname(p))
}

// Final path segment (file name with extension).
export function baseNameOf(p: string): string {
    return path.basename(p)
}

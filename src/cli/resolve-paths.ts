// Turns the raw tsconfig path and positional files (which the parsers keep
// verbatim) into absolute paths for the runners. Files resolve against the
// tsconfig dir (not cwd) so the target set doesn't shift with the working
// directory — the same basis the removed --include used. A trailing `/`
// survives the resolve (move uses it as a "this is a directory" hint).

import path from "node:path"

export function resolvePaths(tsconfigPath: string | undefined, files: string[]): {tsConfigFilePath: string; paths: string[]} {
    const tsConfigFilePath = resolveTsconfigPath(tsconfigPath ?? ".")
    const tsconfigDir = path.dirname(tsConfigFilePath)
    const paths = files.map((g) => {
        const absolute = path.isAbsolute(g) ? g : path.resolve(tsconfigDir, g)
        return g.endsWith("/") || g.endsWith(path.sep) ? absolute + path.sep : absolute
    })
    return {tsConfigFilePath, paths}
}

// Mirrors `tsc -p`: a non-`.json` value is treated as a directory and
// `tsconfig.json` is appended.
function resolveTsconfigPath(input: string): string {
    const absolute = path.resolve(input)
    if (input.endsWith(".json")) return absolute
    return path.join(absolute, "tsconfig.json")
}

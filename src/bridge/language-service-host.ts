// Backing host for the TypeScript language service. Tracked files (the project
// source files we may have edited in memory) are served from the project's own
// snapshots so the service always sees the live text; everything else — lib.d.ts,
// node_modules, project files not yet loaded — falls through to the host fs via
// ts.sys so module resolution and the default library still work. This single
// host serves both real and in-memory projects: only the set of tracked files
// and the persistence backend differ between them.

import ts from "typescript"
import {normalizePath} from "./paths.ts"

// What the language service host needs from the Project. Kept as a narrow
// interface so the Project and the host can live in separate modules without a
// cycle.
export interface LanguageServiceContext {
    getCompilerOptions(): ts.CompilerOptions
    getCurrentDirectory(): string
    // A monotonically increasing token; bumped whenever a tracked file's text,
    // or the set of tracked files, changes, so the service invalidates caches.
    getProjectVersion(): string
    getTrackedFileNames(): string[]
    // Live text of a tracked file, or undefined when the path is untracked.
    getTrackedText(fileName: string): string | undefined
    // Per-file version of a tracked file, or undefined when untracked.
    getTrackedVersion(fileName: string): string | undefined
    // Directory existence aware of in-memory files (see Project).
    directoryExists(dir: string): boolean
}

export function createLanguageServiceHost(ctx: LanguageServiceContext): ts.LanguageServiceHost {
    const sys = ts.sys

    return {
        getCompilationSettings: () => ctx.getCompilerOptions(),
        getCurrentDirectory: () => ctx.getCurrentDirectory(),
        getProjectVersion: () => ctx.getProjectVersion(),
        getScriptFileNames: () => ctx.getTrackedFileNames(),
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
        getNewLine: () => sys.newLine,
        useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames,

        getScriptVersion: (fileName) => ctx.getTrackedVersion(fileName) ?? "0",

        getScriptSnapshot: (fileName) => {
            const tracked = ctx.getTrackedText(fileName)
            if (tracked != null) return ts.ScriptSnapshot.fromString(tracked)
            const onDisk = sys.readFile(fileName)
            return onDisk != null ? ts.ScriptSnapshot.fromString(onDisk) : undefined
        },

        // Reads/existence checks prefer the tracked text, then the host fs.
        // Untracked reads cover lib + node_modules during resolution.
        readFile: (fileName, encoding) => ctx.getTrackedText(fileName) ?? sys.readFile(fileName, encoding),
        fileExists: (fileName) => ctx.getTrackedText(fileName) != null || sys.fileExists(fileName),

        directoryExists: (dir) => ctx.directoryExists(dir),
        getDirectories: (dir) => sys.getDirectories(dir),
        readDirectory: (dir, extensions, exclude, include, depth) => sys.readDirectory(dir, extensions, exclude, include, depth),
        realpath: sys.realpath ? (p) => normalizePath(sys.realpath!(p)) : undefined,
    }
}

// Source file selection shared between action and report. The positional
// file arguments (absolute) select project source files; an empty list means
// the whole project.

import path from "node:path"
import {ScriptKind} from "typescript"
import type {Project, SourceFile} from "../bridge/bridge.ts"

// In-project command/refactor targets only. External declarations (TS lib,
// @types/*, node_modules) are load-only; JSON modules aren't TypeScript and the
// language service would corrupt them. The project's own .d.ts stays.
function isInProject(sf: SourceFile): boolean {
    return !sf.isFromExternalLibrary() && sf.getScriptKind() !== ScriptKind.JSON
}

export function selectSourceFiles(project: Project, {paths}: {paths?: string[]}): SourceFile[] {
    if (paths?.length) {
        const targets = project.getSourceFiles(paths).filter(isInProject)

        // A typo'd / non-project path would otherwise pass silently as "0
        // files". Only the all-missed case is caught: a partial miss is left
        // alone because a duplicate or over-matching glob makes the resolved
        // count unreliable (getSourceFiles dedups), risking false positives.
        if (targets.length === 0) throw new Error(`refine: no project files matched: ${paths.map(displayPath).join(", ")}`)
        return targets
    }

    const all = project.getSourceFiles().filter(isInProject)
    if (all.length === 0) throw new Error("refine: no source files found in the project")
    return all
}

// Every in-project source file, unscoped — for whole-project symbol resolution
// that must not reach into dependencies (see resolve-target).
export function inProjectSourceFiles(project: Project): SourceFile[] {
    return project.getSourceFiles().filter(isInProject)
}

// One in-project file by path. Throws when it is missing or an external-library
// declaration, so a file scope can never point a lookup into a dependency.
export function inProjectSourceFileOrThrow(project: Project, file: string): SourceFile {
    const sf = project.getSourceFile(file)
    if (!sf || !isInProject(sf)) throw new Error(`refine: not in the project: ${file}`)
    return sf
}

// Shortens long paths by dropping everything through the last interior
// `/../`. A leading `../` chain is left alone because it can still be useful
// context when the command itself was run from a nearby relative tsconfig.
export function displayPath(absPath: string): string {
    return path.relative(process.cwd(), absPath).replace(/^.*[/\\]\.\.[/\\]/, "")
}

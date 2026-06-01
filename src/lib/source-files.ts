// Source file selection shared between action and report. The positional
// file arguments (absolute) are forwarded to ts-morph; an empty list means
// the whole project.

import path from "node:path"
import type {Project, SourceFile} from "ts-morph"
import type {TSR} from "ts-refine"

// Never a command/refactor target: external declarations (TS lib, @types/* and
// node_modules packages pulled in via tsconfig) the program loads only for
// type-checking. The project's own .d.ts stays — it is not external — which is
// the point of including .d.ts at all.
function isInProject(sf: SourceFile): boolean {
    return !sf.isFromExternalLibrary()
}

export function selectSourceFiles(project: Project, {paths}: Pick<TSR.ReportOpts, "paths">): SourceFile[] {
    const files = paths.length > 0 ? project.getSourceFiles(paths) : project.getSourceFiles()
    return files.filter(isInProject)
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

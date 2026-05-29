// Source file selection shared between action and report. The positional
// file arguments (absolute) are forwarded to ts-morph; an empty list means
// the whole project.

import path from "node:path"
import type {Project, SourceFile} from "ts-morph"

import type {RunReportsOpts} from "@kawanet/ts-survey"

export function selectSourceFiles(project: Project, {absIncludes}: Pick<RunReportsOpts, "absIncludes">): SourceFile[] {
    return absIncludes.length > 0 ? project.getSourceFiles(absIncludes) : project.getSourceFiles()
}

// Shortens long paths by dropping everything through the last interior
// `/../`. A leading `../` chain is left alone because it can still be useful
// context when the command itself was run from a nearby relative tsconfig.
export function displayPath(absPath: string): string {
    return path.relative(process.cwd(), absPath).replace(/^.*[/\\]\.\.[/\\]/, "")
}

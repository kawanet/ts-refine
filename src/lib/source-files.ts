// Source file selection shared between action and report.
// `include` is forwarded to ts-morph (initial set); `exclude` runs as a
// post filter via minimatch. Passing only negative globs to ts-morph would
// yield an empty set, hence the split handling.

import {minimatch} from "minimatch"
import path from "node:path"
import type {Project, SourceFile} from "ts-morph"

import type {RunReportsOpts} from "@kawanet/ts-survey"

export function selectSourceFiles(project: Project, {absIncludes, absExcludes}: Pick<RunReportsOpts, "absIncludes" | "absExcludes">): SourceFile[] {
    let files = absIncludes.length > 0 ? project.getSourceFiles(absIncludes) : project.getSourceFiles()
    if (absExcludes.length > 0) {
        files = files.filter((sf) => {
            const p = sf.getFilePath()
            return !absExcludes.some((pat) => minimatch(p, pat))
        })
    }
    return files
}

// Shortens long paths by dropping everything through the last interior
// `/../`. A leading `../` chain is left alone because it can still be useful
// context when the command itself was run from a nearby relative tsconfig.
export function displayPath(absPath: string): string {
    return path.relative(process.cwd(), absPath).replace(/^.*[/\\]\.\.[/\\]/, "")
}

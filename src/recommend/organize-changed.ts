// Shared post-processing for the write commands that edit imports/usages
// (move, rename): re-sort the import block of each file they changed. The
// style is one FormatStyle for all files, or a per-file resolver so a project
// with mixed conventions keeps each file's own. Files the command didn't touch
// are not passed in, so they stay as-is until `format` unifies them.

import type {FormatCodeSettings, SourceFile} from "ts-morph"
import type {TSR} from "ts-refine"
import {applyOrganizeImports} from "../lib/organize-imports.ts"
import {formatStyleToSettings} from "./format-settings.ts"

// One style for every file, or a resolver the caller invokes at each file's
// current path. move samples this before relocation (a moved file is reported
// at its original path); see refineMove.
type FormatStyleSource = TSR.FormatStyle | ((file: string) => Promise<TSR.FormatStyle>)

// Sample each file's organize settings now (before move/rename edits), keyed
// by SourceFile — not its path — so a later move() that repaths the node still
// resolves to the right entry. A static style maps every file to the same
// settings without per-file work.
export async function resolveFormatByFile(files: Iterable<SourceFile>, format: FormatStyleSource): Promise<Map<SourceFile, FormatCodeSettings>> {
    const byFile = new Map<SourceFile, FormatCodeSettings>()
    if (typeof format !== "function") {
        const {formatSettings} = formatStyleToSettings(format)
        for (const sf of files) byFile.set(sf, formatSettings)
        return byFile
    }
    for (const sf of files) {
        const {formatSettings} = formatStyleToSettings(await format(sf.getFilePath()))
        byFile.set(sf, formatSettings)
    }
    return byFile
}

// Re-sort each file's imports with its pre-resolved settings.
export function organizeChangedImports(stylesByFile: Map<SourceFile, FormatCodeSettings>): void {
    for (const [sf, settings] of stylesByFile) {
        applyOrganizeImports(sf, settings)
    }
}

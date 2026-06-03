// Per-file import-style survey for the write commands (move, rename): sample
// each changed file's own import/export style up front — before the edit, so it
// reflects the pristine state — and hand back a synchronous lookup. Keyed by
// SourceFile (not path) so a later move() that repaths the node still resolves.
// An unsurveyed file yields undefined, which the caller reads as "leave alone".

import type {FormatCodeSettings, SourceFile} from "ts-morph"
import {formatSettingsForFile} from "./format-settings.ts"

export async function surveyImportStyles(files: Iterable<SourceFile>): Promise<(sf: SourceFile) => FormatCodeSettings | undefined> {
    const byFile = new Map<SourceFile, FormatCodeSettings>()
    for (const sf of files) {
        if (byFile.has(sf)) continue // a repeated file is surveyed once
        byFile.set(sf, await formatSettingsForFile(sf))
    }
    return (sf) => byFile.get(sf)
}

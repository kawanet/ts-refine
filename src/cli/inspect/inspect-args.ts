// `inspect`: per-file analysis. `--<inspector>` flags select which inspectors
// run (default: all). Unknown `--<name>` becomes a selector (validated at
// runtime by refineInspect). Globals are consumed into `common`; the
// `--<name>` catch runs only after parseCommonArgs so it can't swallow
// --project / --dry-run.

import {inspectorNames as knownInspectorNames} from "../../inspect/inspector-names.ts"
import {type CommonArgs, parseCommonArgs} from "../args-common.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface InspectArgs {
    paths: string[]
    // The requested inspector selectors, or the full registry.
    inspectorNames: string[]
}

export function parseInspect(sub: string[], common: CommonArgs): InspectArgs | undefined {
    const inspectorNames: string[] = []
    const paths: string[] = []
    let i = 0

    while (i < sub.length) {
        const a = sub[i]
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed < 0) return undefined
        if (consumed > 0) {
            i += consumed
        } else if (a.startsWith("--")) {
            const name = a.slice(2)
            if (!inspectorNames.includes(name)) inspectorNames.push(name)
            i++
        } else if (a.startsWith("-")) {
            console.error(`unknown option: ${a}`)
            return undefined
        } else {
            paths.push(a)
            i++
        }
    }

    // inspect is read-only; --dry-run is a write-command flag.
    if (common.dryRun) {
        console.error("--dry-run is not valid for the inspect command")
        return undefined
    }

    const effective = inspectorNames.length > 0 ? inspectorNames : [...knownInspectorNames]
    return {paths, inspectorNames: effective}
}

// `inspect`: per-file analysis. `--<inspector>` flags select which inspectors
// run (default: all). Unknown `--<name>` becomes a selector (validated at
// runtime by refineInspect). Globals are consumed into `common`; the
// `--<name>` catch runs only after parseCommonArgs so it can't swallow
// --project / --dry-run.

import {inspectorNames as knownInspectorNames} from "../../common/inspector-names.ts"
import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface InspectArgs {
    paths: string[]

    // The requested inspector selectors, or the full registry.
    inspectors: string[]
}

export function parseInspectArgs(sub: string[], common: CommonArgs): InspectArgs | undefined {
    const inspectorNames: string[] = []
    const paths: string[] = []
    let i = 0

    while (i < sub.length) {
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed > 0) {
            i += consumed
            continue
        }

        const a = sub[i]
        if (a.startsWith("--")) {
            const name = a.slice(2)
            if (!inspectorNames.includes(name)) inspectorNames.push(name)
            i++
        } else if (a.startsWith("-")) {
            throw new Error(`unknown option: ${a}`)
        } else {
            paths.push(a)
            i++
        }
    }

    // inspect is read-only; --dry-run is a write-command flag.
    if (common.dryRun) {
        throw new Error("--dry-run is not valid for the inspect command")
    }

    const effective = inspectorNames.length > 0 ? inspectorNames : [...knownInspectorNames]
    return {paths, inspectors: effective}
}

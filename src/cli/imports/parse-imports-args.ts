// `imports`: positional files only (empty = whole project), no style overrides.
// Organizing follows each file's own surveyed conventions so the project's
// existing style barely shifts; pinning a style is `format`'s job. Globals
// (-p / --dry-run) that land among the files are consumed into `common`.

import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface ImportsArgs {
    paths: string[]
}

export function parseImportsArgs(sub: string[], common: CommonArgs): ImportsArgs | undefined {
    const paths: string[] = []
    let i = 0

    while (i < sub.length) {
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed > 0) {
            i += consumed
            continue
        }

        const a = sub[i]
        if (a.startsWith("-")) {
            throw new Error(`unknown option: ${a}`)
        } else {
            paths.push(a)
            i++
        }
    }

    return {paths}
}

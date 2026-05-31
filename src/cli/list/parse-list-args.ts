// `list`: cleanup-candidate filters plus positional files. Each flag is a
// boolean; multiple are OR-combined downstream. Globals are consumed into
// `common`.

import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// `list` filter flags; OR-combined when more than one is set.
export interface ListFilters {
    noExports: boolean
    noImporters: boolean
    unusedExports: boolean
}

// Raw values only: the runner resolves `paths` into absolute paths.
export interface ListArgs {
    paths: string[]
    listFilters: ListFilters
}

export function parseListArgs(sub: string[], common: CommonArgs): ListArgs | undefined {
    const paths: string[] = []
    let noExports = false
    let noImporters = false
    let unusedExports = false
    let i = 0

    while (i < sub.length) {
        const a = sub[i]
        if (a === "--no-exports") {
            noExports = true
            i++
        } else if (a === "--no-importers") {
            noImporters = true
            i++
        } else if (a === "--unused-exports") {
            unusedExports = true
            i++
        } else {
            const consumed = parseCommonArgs(common, sub, i)
            if (consumed < 0) return undefined
            if (consumed > 0) {
                i += consumed
            } else if (a.startsWith("-")) {
                throw new Error(`unknown option: ${a}`)
            } else {
                paths.push(a)
                i++
            }
        }
    }

    // list is read-only; --dry-run is a write-command flag.
    if (common.dryRun) {
        throw new Error("--dry-run is not valid for the list command")
    }

    return {paths, listFilters: {noExports, noImporters, unusedExports}}
}

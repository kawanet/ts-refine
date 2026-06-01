// `list`: cleanup-candidate filters plus positional files. Each flag is a
// boolean; refineList combines several active ones with AND. Globals are
// consumed into `common`.

import type {TSR} from "../../index.ts"
import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths and hands
// `listFilters` straight to refineList.
export interface ListArgs {
    paths: string[]
    listFilters: TSR.ListFilters
}

export function parseListArgs(sub: string[], common: CommonArgs): ListArgs | undefined {
    const paths: string[] = []
    let noExports = false
    let noImporters = false
    let unusedExports = false
    let i = 0

    while (i < sub.length) {
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed > 0) {
            i += consumed
            continue
        }

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
        } else if (a.startsWith("-")) {
            throw new Error(`unknown option: ${a}`)
        } else {
            paths.push(a)
            i++
        }
    }

    // list is read-only; --dry-run is a write-command flag.
    if (common.dryRun) {
        throw new Error("--dry-run is not valid for the list command")
    }

    return {paths, listFilters: {noExports, noImporters, unusedExports}}
}

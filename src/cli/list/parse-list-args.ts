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
    let ref: string | undefined
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
        } else if (a === "--ref") {
            // Identifiers never start with "-", so a missing or flag-like value
            // is a usage error; the spec itself is resolved by refineList.
            const v = sub[i + 1]
            if (v == null || v.startsWith("-")) throw new Error("--ref requires a <target>")
            ref = v
            i += 2
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

    const listFilters: TSR.ListFilters = {noExports, noImporters, unusedExports}
    if (ref != null) listFilters.ref = ref
    return {paths, listFilters}
}

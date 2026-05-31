// `move`: positional args are `<source...> <dest>` — the parser only validates
// the count and keeps them raw in `paths`; the runner resolves them and splits
// the list (last element → dest, the rest → sources). `paths` rather than
// `files` because the destination may be a directory. Globals are consumed
// into `common`.

import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface MoveArgs {
    paths: string[]
}

export function parseMoveArgs(sub: string[], common: CommonArgs): MoveArgs | undefined {
    const paths: string[] = []
    let i = 0

    while (i < sub.length) {
        const a = sub[i]
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

    if (paths.length < 2) {
        throw new Error("move requires at least one source and a destination (e.g. move foo.ts dest/)")
    }

    return {paths}
}

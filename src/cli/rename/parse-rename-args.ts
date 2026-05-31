// `rename`: rename an exported identifier. --from / --to are required; an
// optional positional file scopes the lookup to that file's exports. Globals
// are consumed into `common`.

import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths. `paths`
// holds the optional scope file (zero or one entry).
export interface RenameArgs {
    paths: string[]
    from: string
    to: string
}

export function parseRenameArgs(sub: string[], common: CommonArgs): RenameArgs | undefined {
    let from: string | undefined
    let to: string | undefined
    const paths: string[] = []
    let i = 0

    while (i < sub.length) {
        const a = sub[i]
        if (a === "--from") {
            from = sub[i + 1]
            if (!from || from.startsWith("-")) {
                console.error("--from requires an identifier (e.g. --from oldName)")
                return undefined
            }
            i += 2
        } else if (a === "--to") {
            to = sub[i + 1]
            if (!to || to.startsWith("-")) {
                console.error("--to requires an identifier (e.g. --to newName)")
                return undefined
            }
            i += 2
        } else {
            const consumed = parseCommonArgs(common, sub, i)
            if (consumed < 0) return undefined
            if (consumed > 0) {
                i += consumed
            } else if (a.startsWith("-")) {
                console.error(`unknown option: ${a}`)
                return undefined
            } else {
                paths.push(a)
                i++
            }
        }
    }

    if (from === undefined || to === undefined) {
        console.error("rename requires --from <name> and --to <name>")
        return undefined
    }
    if (paths.length > 1) {
        console.error("rename accepts at most one file to scope the lookup")
        return undefined
    }

    return {paths, from, to}
}

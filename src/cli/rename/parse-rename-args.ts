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
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed > 0) {
            i += consumed
            continue
        }

        const a = sub[i]
        if (a === "--from") {
            from = sub[i + 1]
            if (!from || from.startsWith("-")) {
                throw new Error("--from requires an identifier (e.g. --from oldName)")
            }
            i += 2
        } else if (a === "--to") {
            to = sub[i + 1]
            if (!to || to.startsWith("-")) {
                throw new Error("--to requires an identifier (e.g. --to newName)")
            }
            i += 2
        } else if (a.startsWith("-")) {
            throw new Error(`unknown option: ${a}`)
        } else {
            paths.push(a)
            i++
        }
    }

    if (from == null || to == null) {
        throw new Error("rename requires --from <name> and --to <name>")
    }
    if (paths.length > 1) {
        throw new Error("rename accepts at most one file to scope the lookup")
    }

    return {paths, from, to}
}

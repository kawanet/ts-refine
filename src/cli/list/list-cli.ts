// `list` runner: gather the cleanup-candidate entries and write the filtered
// table to stdout.

import {refineList} from "../../index.ts"
import {initProject} from "../../lib/init-project.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseListArgs} from "./parse-list-args.ts"
import {filterListEntries, writeListTable} from "./write-list-table.ts"

export const listCLI: CLI = async (ctx) => {
    const {args: common, tokens, output, log} = ctx
    const args = parseListArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the list command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})
    const entries = await refineList({project, paths, log})
    writeListTable(filterListEntries(entries, args.listFilters), output)
    return 0
}

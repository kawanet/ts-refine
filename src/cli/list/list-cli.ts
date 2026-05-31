// `list` runner: gather the cleanup-candidate entries and write the filtered
// table to stdout.

import {initProject, refineList} from "../../index.ts"
import type {Context} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseListArgs} from "./parse-list-args.ts"
import {filterListEntries, writeListTable} from "./write-list-table.ts"

export async function runList(ctx: Context): Promise<number> {
    const {args: common, tokens, stream, log} = ctx
    const args = parseListArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the list command")
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const entries = await refineList(project, {paths, log})
    writeListTable(filterListEntries(entries, args.listFilters), stream)
    return 0
}

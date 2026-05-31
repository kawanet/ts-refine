// `list` runner: gather the cleanup-candidate entries and write the filtered
// table to stdout.

import {initProject, refineList} from "../../index.ts"
import type {CLIStream} from "../cli-io.ts"
import type {CommonArgs} from "../parse-common-args.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseListArgs} from "./parse-list-args.ts"
import {filterListEntries, writeListTable} from "./write-list-table.ts"

export async function runList(sub: string[], common: CommonArgs, stream: CLIStream): Promise<number> {
    const args = parseListArgs(sub, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the list command")
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const entries = await refineList(project, {paths})
    writeListTable(filterListEntries(entries, args.listFilters), stream)
    return 0
}

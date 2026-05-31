// `list` runner: gather the cleanup-candidate entries and write the filtered
// table to stdout.

import {initProject, refineList} from "../../index.ts"
import type {CommonArgs} from "../args-common.ts"
import type {CLIStream} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {filterListEntries, writeListTable} from "./format-list.ts"
import {parseList} from "./list-args.ts"

export async function runList(sub: string[], common: CommonArgs, stream: CLIStream): Promise<number> {
    const args = parseList(sub, common)
    if (!args) return 1
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const entries = await refineList(project, {paths})
    writeListTable(filterListEntries(entries, args.listFilters), stream)
    return 0
}

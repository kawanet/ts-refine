// `inspect` runner: run the selected inspectors and write each file's
// analysis to stdout.

import {initProject, refineInspect, type TSR} from "../../index.ts"
import type {CommonArgs} from "../args-common.ts"
import type {CLIStream} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {writeInspectFile} from "./format-inspect.ts"
import {parseInspect} from "./inspect-args.ts"

export async function runInspect(sub: string[], common: CommonArgs, stream: CLIStream): Promise<number> {
    const args = parseInspect(sub, common)
    if (!args) return 1
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const inspectorNames = args.inspectorNames as TSR.InspectorName[]
    const files = await refineInspect(project, {paths, inspectorNames})
    for (const file of files) writeInspectFile(file, stream)
    return 0
}

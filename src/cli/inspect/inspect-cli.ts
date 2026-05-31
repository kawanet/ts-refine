// `inspect` runner: run the selected inspectors and write each file's
// analysis to stdout.

import {initProject, refineInspect, type TSR} from "../../index.ts"
import type {CLIStream} from "../cli-io.ts"
import type {CommonArgs} from "../parse-common-args.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseInspectArgs} from "./parse-inspect-args.ts"
import {writeInspectFile} from "./write-inspect-file.ts"

export async function runInspect(sub: string[], common: CommonArgs, stream: CLIStream): Promise<number> {
    const args = parseInspectArgs(sub, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the inspect command")
    const {absTsconfig, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath: absTsconfig})
    const inspectorNames = args.inspectorNames as TSR.InspectorName[]
    const files = await refineInspect(project, {paths, inspectorNames})
    for (const file of files) writeInspectFile(file, stream)
    return 0
}

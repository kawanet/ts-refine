// `inspect` runner: run the selected inspectors and write each file's
// analysis to stdout.

import {refineInspect, type TSR} from "../../index.ts"
import {initProject} from "../../lib/init-project.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseInspectArgs} from "./parse-inspect-args.ts"
import {writeInspectFile} from "./write-inspect-file.ts"

export const inspectCLI: CLI = async (ctx) => {
    const {args: common, tokens, output, log} = ctx
    const args = parseInspectArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the inspect command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})
    const inspectorNames = args.inspectorNames as TSR.InspectorName[]
    const files = await refineInspect({project, paths, inspectorNames, log})
    for (const file of files) writeInspectFile(file, output)
    return 0
}

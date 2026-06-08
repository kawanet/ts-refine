// `move` runner: split the resolved positional list into sources + destination,
// then relocate. refineMove samples each changed file's own style (surveyed per
// file) before relocation, so a project with mixed formatting keeps each file's
// conventions; use `format` to unify them instead.

import {createRefineProject, refineMove} from "../../index.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseMoveArgs} from "./parse-move-args.ts"

export const moveCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseMoveArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the move command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = createRefineProject({tsConfigFilePath})
    const sources = paths.slice(0, -1)
    const dest = paths[paths.length - 1]

    await refineMove({project, sources, dest, dryRun: common.dryRun, log})
    return 0
}

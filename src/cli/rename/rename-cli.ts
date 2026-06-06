// `rename` runner: rename the exported identifier. refineRename re-sorts each
// edited file's imports using that file's own surveyed style (per file), so a
// project with mixed formatting keeps each file's conventions.

import {initProject} from "../../common/init-project.ts"
import {refineRename} from "../../index.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseRenameArgs} from "./parse-rename-args.ts"

export const renameCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseRenameArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the rename command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = initProject({tsConfigFilePath})

    await refineRename({project, from: args.from, to: args.to, file: paths[0], dryRun: common.dryRun, log})
    return 0
}

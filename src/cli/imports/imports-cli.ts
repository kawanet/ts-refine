// `imports` runner: organize every selected file's import/export block.
// refineImports surveys each file on its own (imports-only) so a project with
// mixed formatting keeps each file's conventions. Use `format` to unify a
// project's surrounding style instead.

import {logging} from "../../common/logging.ts"
import {createRefineProject, refineImports} from "../../index.ts"
import type {CLI} from "../cli-io.ts"
import {resolvePaths} from "../resolve-paths.ts"
import {parseImportsArgs} from "./parse-imports-args.ts"

export const importsCLI: CLI = async (ctx) => {
    const {args: common, tokens, log} = ctx
    const args = parseImportsArgs(tokens, common)
    if (!args) return 1
    if (common.help) throw new Error("--help is not supported for the imports command")
    const {tsConfigFilePath, paths} = resolvePaths(common.tsconfigPath, args.paths)
    const project = createRefineProject({tsConfigFilePath})

    // `--check` reports without writing, so it forces dry-run; the per-file
    // list and summary are already on the log, so only the fix hint is added.
    const dryRun = common.dryRun || args.check
    const result = await refineImports({project, paths, dryRun, log})
    if (args.check && result.touched.length > 0) {
        logging(log, "Run `ts-refine imports` to fix.")
        return 1
    }
    return 0
}

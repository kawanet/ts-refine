// Project acquisition for the refine* entries. initProject is the thin
// tsconfig→Project builder (internal now); resolveProject picks the project a
// call should use from CommonOpts: a caller-supplied `project`, or one built
// from `tsConfigFilePath`.

import {Project} from "ts-morph"
import type {TSR} from "ts-refine"

export function initProject(opts: {tsConfigFilePath: string}): Project {
    return new Project(opts)
}

// Exactly one of `project` / `tsConfigFilePath` is required — both is a caller
// mistake (the path would be silently ignored), so it throws. tsConfigFilePath
// builds a fresh project, so reuse a `project` across calls rather than
// re-building per call.
export function resolveProject(opts: Pick<TSR.CommonOpts, "project" | "tsConfigFilePath">): Project {
    if (opts.project && opts.tsConfigFilePath) {
        throw new Error("refine: specify either `project` or `tsConfigFilePath`, not both")
    }
    if (opts.project) return opts.project
    if (opts.tsConfigFilePath) return initProject({tsConfigFilePath: opts.tsConfigFilePath})
    throw new Error("refine: specify either `project` or `tsConfigFilePath`")
}

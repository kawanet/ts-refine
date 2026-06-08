// Project acquisition for the refine* entries. initProject is the thin
// tsconfig→Project builder (internal now); resolveProject picks the project a
// call should use from CommonOpts: a caller-supplied `project`, or one built
// from `tsConfigFilePath`.

import type {TSR} from "ts-refine"
import {Project, type ProjectOptions} from "../bridge/bridge.ts"

export function initProject(opts: {tsConfigFilePath: string}): Project {
    return new Project(opts)
}

// Public factory: build a project a caller can construct once and reuse as the
// `project` option across refine* calls. Returns the structural TSR.Project so
// the public surface never exposes the internal compat class.
export function createRefineProject(options?: TSR.ProjectOptions): TSR.Project {
    return new Project(options)
}

// A lib-less in-memory project: no lib.d.ts load, so it is cheap and meant for
// syntactic work only (parsing / member counts / parse diagnostics), never
// semantic analysis of real code. Used by the format separator pass to re-parse
// candidate edits, and by tests that operate on their own in-memory sources.
export function initInMemoryProject(compilerOptions?: ProjectOptions["compilerOptions"]): Project {
    return new Project({useInMemoryFileSystem: true, compilerOptions, skipLoadingLibFiles: true})
}

// Exactly one of `project` / `tsConfigFilePath` is required — both is a caller
// mistake (the path would be silently ignored), so it throws. tsConfigFilePath
// builds a fresh project, so reuse a `project` across calls rather than
// re-building per call.
export function resolveProject(opts: Pick<TSR.CommonOpts, "project" | "tsConfigFilePath">): Project {
    if (opts.project && opts.tsConfigFilePath) {
        throw new Error("refine: specify either `project` or `tsConfigFilePath`, not both")
    }
    // CommonOpts.project is the provisional public surface (TSR.Project); a
    // brought-in project is a full bridge Project at runtime, so widen it back.
    if (opts.project) return opts.project as Project
    if (opts.tsConfigFilePath) return initProject({tsConfigFilePath: opts.tsConfigFilePath})
    throw new Error("refine: specify either `project` or `tsConfigFilePath`")
}

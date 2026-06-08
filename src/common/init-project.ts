// Project acquisition for the refine* entries. createRefineProject is the
// public factory; resolveProject picks the project a call should use from
// CommonOpts: a caller-supplied `project`, or one built from `tsConfigFilePath`.

import type {TSR} from "ts-refine"
import {Project, type ProjectOptions} from "../bridge/bridge.ts"

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
    if (opts.project) {
        // CommonOpts.project is the structural public surface (TSR.Project).
        // Require a real bridge Project — built by createRefineProject — so a
        // hand-rolled object, or one from a different ts-refine instance, fails
        // here with a clear message instead of crashing later on a missing
        // internal method. instanceof also narrows away the unchecked cast.
        if (!(opts.project instanceof Project)) {
            throw new Error("refine: `project` must be built with createRefineProject()")
        }
        return opts.project
    }
    if (opts.tsConfigFilePath) return new Project({tsConfigFilePath: opts.tsConfigFilePath})
    throw new Error("refine: specify either `project` or `tsConfigFilePath`")
}

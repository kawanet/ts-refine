import {builtinModules} from "node:module"

// `dependencies` and Node builtins are resolved at runtime by the consumer —
// never bundle them. Cover both bare and `node:` prefixed forms so the
// result does not depend on which form a source uses. The package's own
// name is included so its self-reference stays external. `typescript` is the
// sole runtime dependency (the compat layer drives its compiler API) and must
// stay external — bundling it would add megabytes.
// prettier-ignore
const externals = new Set<string>([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    "ts-refine",
    "typescript",
])

export const isExternal = (id: string): boolean => {
    if (externals.has(id)) return true
    for (const ext of externals) {
        if (id.startsWith(ext + "/")) return true
    }
    return false
}

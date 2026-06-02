import {strict as assert} from "node:assert"
import fs from "node:fs"
import {createRequire} from "node:module"
import path from "node:path"
import {before, describe, it} from "node:test"
import type {Project} from "ts-morph"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {resolveInProjectAnchors} from "./resolve-target.ts"
import {inProjectSourceFileOrThrow, inProjectSourceFiles} from "./source-files.ts"

// External-library exclusion only has anything to exclude when the project
// actually contains an external-library file, which an in-memory project can't
// produce (isFromExternalLibrary needs real node_modules resolution). So we
// build the repo's own project — where node_modules sits under the root — and
// pull in ts-morph's bundled .d.ts, a guaranteed external file that exports the
// stable symbol `SourceFile`.
const REPO_TSCONFIG = path.resolve(import.meta.dirname, "../../tsconfig.json")

function tsMorphDtsPath(): string {
    const require = createRequire(import.meta.url)
    const pkgPath = require.resolve("ts-morph/package.json")
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
    return path.resolve(path.dirname(pkgPath), pkg.types ?? pkg.typings)
}

describe("resolve-target external-library exclusion", () => {
    let project: Project
    let dts: string

    before(() => {
        dts = tsMorphDtsPath()
        project = initTestProject(REPO_TSCONFIG)
        project.addSourceFileAtPath(dts)
    })

    it("loads the external .d.ts but treats it as out of project", () => {
        const added = project.getSourceFileOrThrow(dts)
        assert.equal(added.isFromExternalLibrary(), true)

        // The raw program sees it; the in-project view filters it out.
        assert.ok(project.getSourceFiles().includes(added))
        assert.ok(!inProjectSourceFiles(project).includes(added))
    })

    it("yields no in-project anchor for a name only an external dependency exports", () => {
        // `SourceFile` is exported by ts-morph's .d.ts (now in the program) but by
        // no in-project file — so the in-project resolver finds nothing rather than
        // reaching into node_modules.
        assert.deepEqual(resolveInProjectAnchors(project, "SourceFile", null), [])
    })

    it("rejects a file scope that points at an external-library file", () => {
        assert.throws(() => resolveInProjectAnchors(project, "SourceFile", dts), /not in the project/)
        assert.throws(() => inProjectSourceFileOrThrow(project, dts), /not in the project/)
    })

    it("rejects a file scope that is not in the project at all", () => {
        assert.throws(() => inProjectSourceFileOrThrow(project, "/no/such/file.ts"), /not in the project/)
    })
})

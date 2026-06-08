// Project: file tracking, path filtering, module resolution, and the in-memory
// file system used by scratch projects.

import assert from "node:assert/strict"
import {test} from "node:test"
import {Project} from "./project.ts"

test("createSourceFile tracks the file; getSourceFileOrThrow rejects a miss", () => {
    const project = new Project({useInMemoryFileSystem: true})
    project.createSourceFile("/p/a.ts", "export const a = 1\n")
    assert.equal(project.getSourceFiles().length, 1)
    assert.equal(project.getSourceFileOrThrow("/p/a.ts").getFilePath(), "/p/a.ts")
    assert.throws(() => project.getSourceFileOrThrow("/p/missing.ts"), /not found/)
})

test("createSourceFile overwrites only when asked", () => {
    const project = new Project({useInMemoryFileSystem: true})
    project.createSourceFile("/p/a.ts", "const a = 1\n")
    assert.throws(() => project.createSourceFile("/p/a.ts", "const a = 2\n"))
    const replaced = project.createSourceFile("/p/a.ts", "const a = 2\n", {overwrite: true})
    assert.match(replaced.getFullText(), /const a = 2/)
})

test("getSourceFiles filters by path", () => {
    const project = new Project({useInMemoryFileSystem: true})
    project.createSourceFile("/p/a.ts", "")
    project.createSourceFile("/p/b.ts", "")
    assert.deepEqual(project.getSourceFiles(["/p/a.ts"]).map((s) => s.getBaseName()), ["a.ts"])
})

test("a relative .ts import resolves to its in-project source file", () => {
    const project = new Project({useInMemoryFileSystem: true})
    const a = project.createSourceFile("/p/a.ts", `import {x} from "./sub/b.ts"\n`)
    const b = project.createSourceFile("/p/sub/b.ts", "export const x = 1\n")
    assert.equal(a.getImportDeclarations()[0].getModuleSpecifierSourceFile(), b)
})

test("the in-memory file system reflects sync writes", () => {
    const fs = new Project({useInMemoryFileSystem: true}).getFileSystem()
    fs.writeFileSync("/p/x.ts", "//\n")
    assert.ok(fs.fileExistsSync("/p/x.ts"))
    assert.ok(fs.directoryExistsSync("/p"))
    assert.ok(!fs.fileExistsSync("/p/y.ts"))
})

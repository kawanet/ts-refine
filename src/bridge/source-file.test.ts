// SourceFile: semantic queries (exported declarations, referencing files) and
// the language-service-backed edits (move, organize-imports).

import assert from "node:assert/strict"
import {test} from "node:test"
import ts from "typescript"
import {Project} from "./project.ts"

function emptyProject(): Project {
    return new Project({useInMemoryFileSystem: true})
}

test("getExportedDeclarations groups by name and follows re-exports to their file", () => {
    const project = emptyProject()
    const a = project.createSourceFile("/p/a.ts", `export function foo() {}\nexport {bar} from "./b.ts"\n`)
    project.createSourceFile("/p/b.ts", "export const bar = 1\n")

    const map = a.getExportedDeclarations()
    assert.deepEqual([...map.keys()].sort(), ["bar", "foo"])
    // A local declaration stays in this file; a re-export resolves to its origin
    // (callers skip those via `decl.getSourceFile() !== sf`).
    assert.equal(map.get("foo")![0].getSourceFile().getFilePath(), "/p/a.ts")
    assert.equal(map.get("bar")![0].getSourceFile().getFilePath(), "/p/b.ts")
})

test("getReferencingSourceFiles finds importers across specifier forms", () => {
    const project = emptyProject()
    const a = project.createSourceFile("/p/a.ts", "export const x = 1\n")
    project.createSourceFile("/p/b.ts", `import {x} from "./a.ts"\n`)
    project.createSourceFile("/p/c.ts", `export {x} from "./a.ts"\n`)
    project.createSourceFile("/p/d.ts", `const p = import("./a.ts")\n`)
    project.createSourceFile("/p/e.ts", `import e = require("./a.ts")\n`)
    project.createSourceFile("/p/f.ts", `export type F = import("./a.ts").X\n`)

    const refs = a.getReferencingSourceFiles().map((s) => s.getBaseName()).sort()
    assert.deepEqual(refs, ["b.ts", "c.ts", "d.ts", "e.ts", "f.ts"])
})

test("getDescendantsOfKind returns typed CallExpression wrappers", () => {
    const a = emptyProject().createSourceFile("/p/a.ts", "foo()\nbar(baz())\n")
    const calls = a.getDescendantsOfKind(ts.SyntaxKind.CallExpression)
    assert.equal(calls.length, 3)
    assert.deepEqual(calls.map((c) => c.getExpression().getText()).sort(), ["bar", "baz", "foo"])
})

test("move relocates the file and rewrites importer specifiers", () => {
    const project = emptyProject()
    const a = project.createSourceFile("/p/a.ts", "export const a = 1\n")
    const b = project.createSourceFile("/p/b.ts", `import {a} from "./a.ts"\nexport const b = a\n`)
    a.move("/p/sub/a.ts")
    assert.equal(a.getFilePath(), "/p/sub/a.ts")
    assert.match(b.getFullText(), /from "\.\/sub\/a/)
})

test("a wrapper on the moved file revalidates against the reparsed tree", () => {
    const project = emptyProject()
    // No importers and no outgoing specifiers, so the move produces no text
    // edits for this file — only the repath replaces its tree.
    const a = project.createSourceFile("/p/a.ts", "export const value = 1\n")
    const decl = a.getStatements()[0]
    a.move("/p/sub/a.ts")
    assert.equal(decl.compilerNode.getSourceFile(), a.compilerNode)
})

test("a move that changes the extension updates the script kind", () => {
    const project = emptyProject()
    const a = project.createSourceFile("/p/a.ts", "export const value = 1\n")
    a.move("/p/a.tsx")
    assert.equal(a.getScriptKind(), ts.ScriptKind.TSX)
})

test("organizeImports sorts named specifiers", () => {
    const project = emptyProject()
    const a = project.createSourceFile("/p/a.ts", `import {b, a} from "./x.ts"\nconsole.log(a, b)\n`)
    project.createSourceFile("/p/x.ts", "export const a = 1\nexport const b = 2\n")
    a.organizeImports({})
    assert.match(a.getImportDeclarations()[0].getText(), /\{\s*a,\s*b\s*\}/)
})

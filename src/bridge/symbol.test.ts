// Symbol: the dotted-target walk's primitives — export/member lookup and alias
// resolution through the checker.

import assert from "node:assert/strict"
import {test} from "node:test"
import {Project} from "./project.ts"

test("getExport and getMember reach namespace exports and type members", () => {
    const a = new Project({useInMemoryFileSystem: true}).createSourceFile("/p/a.ts", "export namespace NS { export const a = 1 }\nexport interface I { x: number }\n")
    const ns = a.getExportedDeclarations().get("NS")![0].getSymbol()!
    assert.equal(ns.getExport("a")?.getName(), "a")
    const i = a.getExportedDeclarations().get("I")![0].getSymbol()!
    assert.equal(i.getMember("x")?.getName(), "x")
})

test("getAliasedSymbol follows an import binding to its origin", () => {
    const project = new Project({useInMemoryFileSystem: true})
    project.createSourceFile("/p/a.ts", "export const orig = 1\n")
    const b = project.createSourceFile("/p/b.ts", `import {orig} from "./a.ts"\nconsole.log(orig)\n`)
    const binding = b.getImportDeclarations()[0].getNamedImports()[0].getNameNode()
    assert.equal(binding.getSymbol()?.getAliasedSymbol()?.getName(), "orig")
})

// Node wrappers: accessors, type guards, and the lazy revalidation that keeps a
// captured wrapper usable across a non-structural edit.

import assert from "node:assert/strict"
import {test} from "node:test"
import {Node} from "./node.ts"
import {Project} from "./project.ts"

function single(text: string) {
    const project = new Project({useInMemoryFileSystem: true})
    return project.createSourceFile("/p/a.ts", text)
}

test("import declaration accessors expose clause, specifiers, and aliases", () => {
    const project = new Project({useInMemoryFileSystem: true})
    const a = project.createSourceFile("/p/a.ts", `import def, {a, b as c} from "./d.ts"\nimport type {T} from "./d.ts"\nimport * as ns from "./d.ts"\n`)
    project.createSourceFile("/p/d.ts", "export const a = 1\nexport const b = 2\nexport type T = number\n")

    const [withNamed, typeOnly, namespace] = a.getImportDeclarations()
    assert.equal(withNamed.getModuleSpecifierValue(), "./d.ts")
    assert.equal(withNamed.getModuleSpecifierSourceFile()?.getFilePath(), "/p/d.ts")
    assert.equal(withNamed.getDefaultImport()?.getText(), "def")
    const named = withNamed.getNamedImports()
    assert.deepEqual(named.map((n) => n.getName()), ["a", "b"]) // module-side name
    assert.equal(named[1].getAliasNode()?.getText(), "c") // local alias of `b as c`
    assert.equal(typeOnly.isTypeOnly(), true)
    assert.equal(namespace.getNamespaceImport()?.getText(), "ns")
})

test("static guards narrow a wrapper to its kind", () => {
    const a = single("export function foo() {}\nconst s = 1\n")
    const [fn, varStmt] = a.getStatements()
    assert.ok(Node.isFunctionDeclaration(fn))
    assert.ok(!Node.isClassDeclaration(fn))
    assert.ok(!Node.isFunctionDeclaration(varStmt))
})

test("getNameNode and getBody read the underlying AST", () => {
    const a = single("class C { m() { return 1 } p = 2 }\n")
    const [cls] = a.getClasses()
    assert.equal(cls.getName(), "C")
    assert.equal(cls.getNameNode()?.getText(), "C")
    const [method, property] = cls.getMembers()
    assert.ok(method.getBody() != null) // a method ends in its own body
    assert.equal(property.getBody(), undefined) // a field has none
})

test("rename rewrites the declaration and every importer", () => {
    const project = new Project({useInMemoryFileSystem: true})
    const a = project.createSourceFile("/p/a.ts", "export const foo = 1\n")
    const b = project.createSourceFile("/p/b.ts", `import {foo} from "./a.ts"\nconsole.log(foo)\n`)
    a.getExportedDeclarations().get("foo")![0].getNameNode()!.rename("bar")
    assert.match(a.getFullText(), /export const bar = 1/)
    assert.match(b.getFullText(), /import \{bar\}/)
    assert.match(b.getFullText(), /console\.log\(bar\)/)
})

test("findReferencesAsNodes spans declaration and usage files", () => {
    const project = new Project({useInMemoryFileSystem: true})
    const a = project.createSourceFile("/p/a.ts", "export const foo = 1\n")
    project.createSourceFile("/p/b.ts", `import {foo} from "./a.ts"\nconsole.log(foo)\n`)
    const refs = a.getExportedDeclarations().get("foo")![0].getNameNode()!.findReferencesAsNodes()
    const files = new Set(refs.map((r) => r.getSourceFile().getFilePath()))
    assert.ok(files.has("/p/a.ts"))
    assert.ok(files.has("/p/b.ts"))
})

test("rename rewrites a shorthand destructuring with an explicit alias", () => {
    const project = new Project({useInMemoryFileSystem: true})
    const a = project.createSourceFile("/p/a.ts", "export interface Box { width: number }\n")
    const b = project.createSourceFile("/p/b.ts", "import type {Box} from \"./a.ts\"\nexport function read(box: Box) {\n  const { width } = box\n  return width\n}\n")
    const member = a.getExportedDeclarations().get("Box")![0].getSymbol()!.getMember("width")!
    member.getDeclarations()[0].getNameNode()!.rename("height")
    // The property renames, but the destructuring keeps its local name via an
    // explicit `height: width` rather than silently renaming the local too.
    assert.match(b.getFullText(), /const \{ height: width \} = box/)
})

test("setModuleSpecifier escapes the quote character in the new path", () => {
    const project = new Project({useInMemoryFileSystem: true})
    // Single-quoted specifier; the new path contains a single quote (a dir
    // named bob's). Without escaping this would emit invalid source.
    const a = project.createSourceFile("/p/a.ts", "import {x} from './old.ts'\n")
    a.getImportDeclarations()[0].setModuleSpecifier("./bob's/a.ts")
    assert.match(a.getFullText(), /from '\.\/bob\\'s\/a\.ts'/)
    // It must re-parse back to the decoded path.
    assert.equal(a.getImportDeclarations()[0].getModuleSpecifierValue(), "./bob's/a.ts")
})

test("a wrapper captured before an edit revalidates against the reparsed tree", () => {
    const project = new Project({useInMemoryFileSystem: true})
    const a = project.createSourceFile("/p/a.ts", "export const a = 1\n")
    const b = project.createSourceFile("/p/b.ts", `import {a} from "./a.ts"\n`)
    const decl = b.getImportDeclarations()[0]
    a.move("/p/sub/a.ts") // rewrites b's specifier and reparses it
    assert.match(decl.getModuleSpecifierValue(), /sub\/a/)
})

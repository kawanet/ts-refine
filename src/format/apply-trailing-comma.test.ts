import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {applyTrailingComma} from "./apply-trailing-comma.ts"

function run(src: string, mode: "on" | "off", filePath = "/a.ts"): string {
    const project = initInMemoryProject()
    const sf = project.createSourceFile(filePath, src, {overwrite: true})
    applyTrailingComma(sf, mode)
    return sf.getFullText()
}

describe("applyTrailingComma", () => {
    it("on adds a trailing comma to a multi-line array; off removes it", () => {
        const multi = "const a = [\n    1,\n    2\n]\n"
        assert.equal(run(multi, "on"), "const a = [\n    1,\n    2,\n]\n")
        assert.equal(run("const a = [\n    1,\n    2,\n]\n", "off"), multi)
    })

    it("on strips a trailing comma from a single-line list", () => {
        assert.equal(run("const a = [1, 2,]\n", "on"), "const a = [1, 2]\n")
    })

    it("covers objects, call args, params, enums, tuples, named imports (multi-line, on)", () => {
        for (const [src, expected] of [
            ["const o = {\n    a: 1,\n    b: 2\n}\n", "const o = {\n    a: 1,\n    b: 2,\n}\n"],
            ["fn(\n    a,\n    b\n)\n", "fn(\n    a,\n    b,\n)\n"],
            ["function f(\n    a,\n    b\n) {}\n", "function f(\n    a,\n    b,\n) {}\n"],
            ["enum E {\n    A,\n    B\n}\n", "enum E {\n    A,\n    B,\n}\n"],
            ["type T = [\n    number,\n    string\n]\n", "type T = [\n    number,\n    string,\n]\n"],
            ["import {\n    a,\n    b\n} from './m.ts'\n", "import {\n    a,\n    b,\n} from './m.ts'\n"],
            ["export {\n    a,\n    b\n} from './m.ts'\n", "export {\n    a,\n    b,\n} from './m.ts'\n"],
        ] as const) {
            assert.equal(run(src, "on"), expected)
        }
    })

    it("never touches a spread / rest last element, in either mode", () => {
        const arr = "const a = [\n    ...xs\n]\n"
        assert.equal(run(arr, "on"), arr)
        const rest = "function f(\n    ...args\n) {}\n"
        assert.equal(run(rest, "on"), rest)
        // Rest also as the last element of an object binding and a tuple type.
        const objRest = "const {\n    a,\n    ...rest\n} = o\n"
        assert.equal(run(objRest, "on"), objRest)
        const tupleRest = "type T = [\n    A,\n    ...B[]\n]\n"
        assert.equal(run(tupleRest, "on"), tupleRest)
        // `off` must not strip an existing spread trailing comma: honoring
        // remove but not add (a syntax error after rest) would be lopsided, so
        // the position is excluded in both directions, not handled one-way.
        const withComma = "const b = [\n    ...ys,\n]\n"
        assert.equal(run(withComma, "off"), withComma)
    })

    it("leaves angle-bracket lists untouched (type params / args, TSX)", () => {
        // Intentional difference from Prettier `all`, which adds a comma to a
        // multi-line type-parameter declaration: ts-refine never touches any
        // angle list, keeping the output always syntactically valid.
        // prettier-ignore
        for (const src of [
            "class Foo<\n    A,\n    B\n> {}\n",
            "const x: Bar<\n    A,\n    B\n> = y\n",
        ]) {
            assert.equal(run(src, "on"), src)
        }
        // TSX `<T,>`: the comma disambiguates the type-parameter list from a JSX
        // tag, so stripping it would break parsing. Preserved (angle untouched).
        assert.equal(run("const f = <T,>() => null\n", "on", "/a.tsx"), "const f = <T,>() => null\n")
    })

    it("leaves interface / type-literal members to the separators pass", () => {
        const iface = "interface I {\n    a: number,\n    b: string\n}\n"
        assert.equal(run(iface, "on"), iface)
    })

    it("formats every list in a multi-declaration file (edits applied after the walk)", () => {
        const src = "const a = [\n    1\n]\nconst b = {\n    x: 1\n}\n"
        assert.equal(run(src, "on"), "const a = [\n    1,\n]\nconst b = {\n    x: 1,\n}\n")
    })

    it("inserts the comma before a trailing comment", () => {
        const src = "const a = [\n    1,\n    2 // last\n]\n"
        assert.equal(run(src, "on"), "const a = [\n    1,\n    2, // last\n]\n")
    })

    it("treats a comma inside a trailing comment as trivia, not the delimiter", () => {
        // `on` must still add the real comma (the comment comma is not one)...
        assert.equal(run("const a = [\n    1 // a, b\n]\n", "on"), "const a = [\n    1, // a, b\n]\n")
        // ...and `off` must drop only the real comma, leaving the comment intact.
        assert.equal(run("const a = [\n    1, // a, b\n]\n", "off"), "const a = [\n    1 // a, b\n]\n")
    })

    it("leaves an empty list untouched", () => {
        assert.equal(run("const a = []\nconst o = {}\n", "on"), "const a = []\nconst o = {}\n")
    })

    it("is idempotent", () => {
        const once = run("const a = [\n    1,\n    2\n]\n", "on")
        assert.equal(run(once, "on"), once)
    })

    it("importsOnly: touches only import/export specifier lists, not the body", () => {
        const project = initInMemoryProject()
        // An import and a body array, both multi-line without a trailing comma.
        const src = "import {\n    a,\n    b\n} from './m.ts'\nconst xs = [\n    a,\n    b\n]\n"
        const sf = project.createSourceFile("/a.ts", src, {overwrite: true})
        applyTrailingComma(sf, "on", {importsOnly: true})
        // Only the import gains the comma; the body array is left as written.
        assert.equal(sf.getFullText(), "import {\n    a,\n    b,\n} from './m.ts'\nconst xs = [\n    a,\n    b\n]\n")
    })

    it("importsOnly: reasserts the comma on a multi-line local export too", () => {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("/a.ts", "const a = 1\nconst b = 2\nexport {\n    a,\n    b\n}\n", {overwrite: true})
        applyTrailingComma(sf, "on", {importsOnly: true})
        assert.equal(sf.getFullText(), "const a = 1\nconst b = 2\nexport {\n    a,\n    b,\n}\n")
    })

    // Arrow-function parameter lists go through findListCloseParen — the only
    // listOf branch that locates its close token by source-text scan rather
    // than by `node.end - 1`. The cases below pin how hand-written arrow
    // parameter lists are rewritten, exercising that scan.

    it("bare arrow (`x => x`) is left untouched in either mode", () => {
        // No parens means nothing to enforce a comma on; arrow-parens is out
        // of scope for ts-refine, so the paren-less arrow is left as written.
        const src = "const f = x => x\n"
        assert.equal(run(src, "on"), src)
        assert.equal(run(src, "off"), src)
    })

    it("on adds a comma to a multi-line paren arrow, before a line comment", () => {
        // Exercises findListCloseParen skipping `// last` to reach `)`, then
        // inserting the comma after the last parameter (before the comment).
        const src = "const f = (\n    a,\n    b // last\n) => a + b\n"
        const expected = "const f = (\n    a,\n    b, // last\n) => a + b\n"
        assert.equal(run(src, "on"), expected)
    })

    it("off drops a multi-line paren arrow's trailing comma, keeping the layout", () => {
        // ts-refine has no printWidth and never reflows: the author's
        // multi-line layout is preserved, only the trailing comma is removed.
        const src = "const f = (\n    a,\n    b,\n) => a + b\n"
        const expected = "const f = (\n    a,\n    b\n) => a + b\n"
        assert.equal(run(src, "off"), expected)
    })

    // Dynamic `import()` is the one CallExpression Prettier `trailingComma:
    // "all"` excludes: it never trails the argument list and strips an existing
    // comma. `on` mirrors that (never add, and remove like a single-line list),
    // while a normal call / `new` keeps the multi-line comma it always had.

    it("on does not add a trailing comma to a multi-line dynamic import", () => {
        const src = "const x = await import(\n    `./mod.json`\n)\n"
        assert.equal(run(src, "on"), src)
    })

    it("on strips an existing trailing comma from a dynamic import (Prettier parity)", () => {
        assert.equal(run("const x = await import(\n    `./mod.json`,\n)\n", "on"), "const x = await import(\n    `./mod.json`\n)\n")
    })

    it("on leaves a two-argument dynamic import's list bare but commas nested lists", () => {
        // The import's own arg list gets no trailing comma; the inner object
        // literal is a separate list and follows the normal multi-line rule.
        const src = "const x = await import(\n    `./mod.json`,\n    {\n        with: {\n            type: \"json\"\n        }\n    }\n)\n"
        const expected = "const x = await import(\n    `./mod.json`,\n    {\n        with: {\n            type: \"json\",\n        },\n    }\n)\n"
        assert.equal(run(src, "on"), expected)
    })

    it("on still adds the trailing comma to a normal call and `new` (not excluded)", () => {
        assert.equal(run("fn(\n    a,\n    b\n)\n", "on"), "fn(\n    a,\n    b,\n)\n")
        assert.equal(run("new Foo(\n    a,\n    b\n)\n", "on"), "new Foo(\n    a,\n    b,\n)\n")
    })
})

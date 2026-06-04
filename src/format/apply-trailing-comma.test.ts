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
        // Rest also as the last element of an object binding and a tuple type:
        // `getText().startsWith("...")` catches both, so no comma is added.
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
})

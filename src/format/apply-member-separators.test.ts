import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {initInMemoryProject} from "../common/init-project.ts"
import {applyMemberSeparators} from "./apply-member-separators.ts"

// Operates on the AST directly (no formatText) so the assertions pin exactly
// what the separator pass does, free of LS whitespace normalization.
function run(src: string, style: "semi" | "comma" | "none"): string {
    const project = initInMemoryProject()
    const sf = project.createSourceFile("/a.ts", src, {overwrite: true})
    applyMemberSeparators(sf, style)
    return sf.getFullText()
}

const IFACE = "interface I {\n    a: number\n    b(): void\n    c: string\n}\n"

describe("applyMemberSeparators", () => {
    it("semi: every interface member (incl. method signature) ends with `;`", () => {
        assert.equal(run(IFACE, "semi"), "interface I {\n    a: number;\n    b(): void;\n    c: string;\n}\n")
    })

    it("comma: every interface member ends with `,` (incl. the last)", () => {
        assert.equal(run(IFACE, "comma"), "interface I {\n    a: number,\n    b(): void,\n    c: string,\n}\n")
    })

    it("normalizes every member kind (property / method / index / call / construct signature)", () => {
        const src = "interface I {\n    p: number\n    m(): void\n    [k: string]: unknown\n    (): void\n    new (): I\n}\n"
        const out = run(src, "semi")
        for (const line of ["p: number;", "m(): void;", "[k: string]: unknown;", "(): void;", "new (): I;"]) {
            assert.match(out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        }
    })

    it("none: drops separators when members are newline-separated", () => {
        const semi = "interface I {\n    a: number;\n    b: string;\n}\n"
        assert.equal(run(semi, "none"), "interface I {\n    a: number\n    b: string\n}\n")
    })

    it("converts between styles (comma -> semi)", () => {
        const comma = "interface J {\n    a: number,\n    b: string,\n}\n"
        assert.equal(run(comma, "semi"), "interface J {\n    a: number;\n    b: string;\n}\n")
    })

    it("comma: leaves class fields untouched (`class C { x = 1, }` is a syntax error)", () => {
        const cls = "class C {\n    x = 1;\n    y = 2;\n}\n"
        // No commas introduced; the existing separators are kept as-is.
        assert.equal(run(cls, "comma"), cls)
    })

    it("semi/none: normalizes class fields but leaves body-bearing members untouched", () => {
        const cls = "class C {\n    x = 1\n    m() { return 1 }\n    y = 2\n}\n"
        const out = run(cls, "semi")
        assert.match(out, /x = 1;/)
        assert.match(out, /y = 2;/)
        assert.match(out, /m\(\) \{ return 1 \}\n/) // method keeps its own body, no separator
    })

    it("none: keeps `;` on a bare member before a signature (removing it would fuse them)", () => {
        // `foo` + `<T>(): T` reparses as one generic method without the `;`.
        const src = "interface I {\n    foo;\n    <T>(): T;\n}\n"
        const out = run(src, "none")
        assert.match(out, /foo;\n/, "bare member keeps its separator")
    })

    it("none: drops the separator after a type-annotated member (no fusion hazard)", () => {
        const src = "interface I {\n    foo: X;\n    (): T;\n}\n"
        const out = run(src, "none")
        assert.match(out, /foo: X\n/, "typed member is safe to unseparate")
    })

    it("none: keeps `;` when a separable member is followed by an inline body member", () => {
        // The field and the method share a line; dropping the `;` fuses them.
        const src = "class C { x = 1; m() {} }\n"
        const out = run(src, "none")
        assert.match(out, /x = 1; m\(\) \{\}/)
    })

    it("none keeps `;` before a class computed field (removing it fuses the expression)", () => {
        // `x = foo` + `[y] = 1` reparses as `x = foo[y] = 1` without the `;`.
        const src = "class C {\n    x = foo;\n    [y] = 1;\n}\n"
        const out = run(src, "none")
        assert.match(out, /x = foo;\n/, "separator before the computed field is kept")
        // Re-parsing keeps two distinct members.
        const project = initInMemoryProject()
        assert.equal(project.createSourceFile("/c.ts", out, {overwrite: true}).getClasses()[0].getMembers().length, 2)
    })

    it("none drops the separator before an interface index signature (type context, no fusion)", () => {
        const src = "interface I {\n    x: number;\n    [k: string]: unknown;\n}\n"
        const out = run(src, "none")
        assert.match(out, /x: number\n/, "interface index signatures don't continue the prior member")
    })

    it("none keeps `;` between same-line members (removing it would be a syntax error)", () => {
        const inline = "interface S { a: number; b: string; }\n"
        const out = run(inline, "none")
        assert.match(out, /a: number; b: string\b/)
        assert.ok(!/b: string;/.test(out), "trailing separator on the last member is dropped")
    })

    it("is idempotent (a second pass changes nothing)", () => {
        const once = run(IFACE, "comma")
        const twice = run(once, "comma")
        assert.equal(twice, once)
    })

    it("leaves a type literal untouched (out of v1 scope: interface/class only)", () => {
        const lit = "type T = {p: number; q: number}\n"
        assert.equal(run(lit, "comma"), lit)
    })

    it("leaves an empty interface / class untouched (no members)", () => {
        assert.equal(run("interface E {}\n", "semi"), "interface E {}\n")
        assert.equal(run("class E {}\n", "none"), "class E {}\n")
    })

    it("handles a single-member interface (separator added and removed)", () => {
        assert.equal(run("interface S {\n    a: number\n}\n", "semi"), "interface S {\n    a: number;\n}\n")
        assert.equal(run("interface S {\n    a: number;\n}\n", "none"), "interface S {\n    a: number\n}\n")
    })

    it("comma leaves a lone class field alone (commas are invalid on class members)", () => {
        const cls = "class C {\n    x = 1\n}\n"
        assert.equal(run(cls, "comma"), cls)
    })

    it("none removes the separator from a lone bare member (nothing to fuse with before `}`)", () => {
        assert.equal(run("interface S {\n    foo;\n}\n", "none"), "interface S {\n    foo\n}\n")
    })

    it("formats every interface/class in a multi-declaration file", () => {
        // Regression: edits must be applied after the whole-file walk, not
        // mid-traversal — otherwise the second declaration is skipped/corrupted.
        const src = "interface A {\n    a: number\n    b: string\n}\nclass C {\n    x = 1\n    y = 2\n}\n"
        const out = run(src, "semi")
        for (const re of [/a: number;/, /b: string;/, /x = 1;/, /y = 2;/]) assert.match(out, re)
    })

    it("none normalizes a leading-`;` member without breaking it", () => {
        // The `;` terminates the previous member even on the next line. Removing
        // it from two newline-separated typed members is safe (re-parse agrees).
        const src = "interface bar {\n    foo: string\n    ;buz: number\n}\n"
        const out = run(src, "none")
        assert.match(out, /foo: string\n\s*buz: number/)
        assert.ok(!out.includes(";"), "the stray leading `;` is gone")
    })

    it("none keeps a separator inline before a body-bearing member with a comment between", () => {
        // The comment is the next member's leading trivia; the verifier still
        // judges against the real next member, and the comment is preserved.
        const src = "class C {\n    x = a;\n    // keep me\n    [y] = 1;\n}\n"
        const out = run(src, "none")
        assert.match(out, /x = a;/, "separator before the computed field stays")
        assert.match(out, /\/\/ keep me/, "comment is preserved")
    })

    it("none drops the separator across an inline comment between members, keeping the comment", () => {
        const src = "interface I {\n    a: number;\n    // note\n    b: string;\n}\n"
        const out = run(src, "none")
        assert.match(out, /a: number\n/, "separator dropped (typed members, no fusion)")
        assert.ok(out.includes("// note"), "inline comment preserved")
        assert.ok(!out.includes(";"), "no separators remain")
    })

    it("none drops the separator across a multi-line block comment, keeping the comment", () => {
        const src = "interface I {\n    a: number;\n    /* multi\n       line */\n    b: string;\n}\n"
        const out = run(src, "none")
        assert.match(out, /a: number\n/, "separator dropped")
        assert.ok(out.includes("/* multi") && out.includes("line */"), "multi-line comment preserved verbatim")
    })

    it("none keeps `;` between same-line members separated only by a block comment", () => {
        // Removing the `;` would fuse `a` and `b` — the block comment is trivia.
        const src = "interface I { a: number; /* c */ b: string; }\n"
        const out = run(src, "none")
        assert.ok(out.includes("a: number; /* c */ b: string"), "same-line separator kept across the comment")
    })
})

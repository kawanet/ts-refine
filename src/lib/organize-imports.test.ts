// applyOrganizeImports coverage. The focus is the semicolon cleanup that
// follows organizeImports: under semicolons:Remove the printer re-adds a `;`
// to a declaration trailed by a same-line comment, and the wrapper strips
// exactly that `;` without reformatting the rest of the file.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import ts from "typescript"
import {initInMemoryProject} from "../common/init-project.ts"
import {applyOrganizeImports} from "./organize-imports.ts"

// bracketSpacing off so `{}`/`{a}` print without inner spaces, keeping the
// assertions about the trailing `;` unambiguous.
const REMOVE: ts.FormatCodeSettings = {
    semicolons: ts.SemicolonPreference.Remove,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: false,
}
const INSERT: ts.FormatCodeSettings = {
    semicolons: ts.SemicolonPreference.Insert,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: false,
}

function run(text: string, settings: ts.FormatCodeSettings) {
    const project = initInMemoryProject()
    const sf = project.createSourceFile("a.ts", text)
    applyOrganizeImports(sf, {settings})
    return sf.getFullText()
}

describe("applyOrganizeImports semicolon cleanup", () => {
    it("strips the `;` re-added to `export {}` with a trailing line comment", () => {
        assert.equal(run("export {} // c\n", REMOVE), "export {} // c\n")
    })

    it("keeps the `;` under a trailing block comment (code may follow on the line)", () => {
        // A `//` runs to EOL so its `;` is always droppable, but a block comment
        // can precede same-line code that needs the `;`; leave block cases alone.
        assert.equal(run("export {} /* c */\n", REMOVE), "export {}; /* c */\n")
    })

    it("strips the `;` on a comment-trailed import that is still in use", () => {
        const out = run('import {a} from "./d.ts" // keep\nexport const y = a\n', REMOVE)
        assert.equal(out, 'import {a} from "./d.ts" // keep\nexport const y = a\n')
    })

    it("keeps the `;` under semicolons:Insert", () => {
        assert.equal(run("export {} // c\n", INSERT), "export {}; // c\n")
    })

    it("leaves a comment-less declaration alone (organizeImports adds no `;`)", () => {
        assert.equal(run("export {}\n", REMOVE), "export {}\n")
    })

    it("does not reformat the rest of the file, only the spurious `;`", () => {
        // Body kept deliberately off-style (2-space indent, kept `;`): the
        // wrapper must not touch anything but the import/export `;`.
        const messy = ["export {} // c", "export const foo = {", "  a: 1,", "};", ""].join("\n")
        const expected = ["export {} // c", "export const foo = {", "  a: 1,", "};", ""].join("\n")
        assert.equal(run(messy, REMOVE), expected)
    })
})

describe("applyOrganizeImports trailing-comma reassertion", () => {
    function organize(text: string, trailingComma: "on" | "off") {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", text)
        applyOrganizeImports(sf, {settings: REMOVE, trailingComma})
        return sf.getFullText()
    }

    // organizeImports rebuilds a local `export {}` specifier list and drops its
    // trailing comma; the self-pass reasserts the surveyed style. (move/rename
    // share applyOrganizeImports, so this covers them too.)
    // organizeImports also squishes the elements onto one line (out-of-scope
    // layout quirk); the assertion targets the trailing comma only.
    it("on: restores the comma organizeImports drops from a multi-line local export", () => {
        assert.match(organize("const a = 1\nconst b = 2\nexport {\n    b,\n    a,\n}\n", "on"), /export \{\n {4}a, b,\n\}/)
    })

    it("off: leaves the export without a trailing comma", () => {
        assert.match(organize("const a = 1\nconst b = 2\nexport {\n    b,\n    a,\n}\n", "off"), /export \{\n {4}a, b\n\}/)
    })
})

describe("applyOrganizeImports trailing-comma + semicolons together", () => {
    function organize(text: string, settings: ts.FormatCodeSettings, trailingComma: "on" | "off") {
        const project = initInMemoryProject()
        const sf = project.createSourceFile("a.ts", text)
        applyOrganizeImports(sf, {settings, trailingComma})
        return sf.getFullText()
    }

    // A comment-trailed local export, with and without the comma/`;`.
    const BARE = "const foo = 1\nexport {\n    foo\n} // comment\n"
    const FULL = "const foo = 1\nexport {\n    foo,\n}; // comment\n"

    // The two axes are independent and each idempotent: on/on and off/off are
    // exact inverses. The comma sits inside `{}`; the `;` lands after `}` and
    // before the line comment, which is preserved either way.
    it("on + on: adds the trailing comma and the `;`", () => {
        assert.equal(organize(BARE, INSERT, "on"), FULL)
        assert.equal(organize(FULL, INSERT, "on"), FULL) // idempotent
    })

    it("off + off: removes the trailing comma and the `;`", () => {
        assert.equal(organize(FULL, REMOVE, "off"), BARE)
        assert.equal(organize(BARE, REMOVE, "off"), BARE) // idempotent
    })
})

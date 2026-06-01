// applyOrganizeImports coverage. The focus is the semicolon cleanup that
// follows organizeImports: under semicolons:Remove the printer re-adds a `;`
// to a declaration trailed by a same-line comment, and the wrapper strips
// exactly that `;` without reformatting the rest of the file.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {ts} from "ts-morph"
import {initInMemoryTestProject} from "../test-utils/init-test-project.ts"
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
    const project = initInMemoryTestProject()
    const sf = project.createSourceFile("a.ts", text)
    applyOrganizeImports(sf, settings)
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

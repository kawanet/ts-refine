// Reuses the original indent-action coverage against the unified
// refineFormat entry point. Each it block exercises `refineFormat({indent: N})`
// instead of the retired `runIndent`; the assertions are preserved.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import type {TSR} from "ts-refine"
import {refineFormat} from "./refine-format.ts"

// Builds FormatOpts with the indent override pinned and unrelated
// passes (organize-imports) silenced so the test exercises only the
// indent dimension.
function opts(width: number): Omit<TSR.FormatOpts, "report"> & {report: TSR.ReportResult} {
    return {dryRun: true, paths: [], indent: width, organizeImports: "off", report: {}, log}
}

const log = {write: () => {}}

describe("refineFormat --indent (dry-run, in-memory)", () => {
    it("expands 2-space indent to 4-space", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("a.ts", ["function f() {", "  return 1", "}", ""].join("\n"))
        await refineFormat(project, opts(4))
        assert.match(sf.getFullText(), /\n {4}return 1\n/)
    })

    it("expands a single leading tab to width spaces", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("b.ts", ["function f() {", "\treturn 1", "}", ""].join("\n"))
        await refineFormat(project, opts(4))
        assert.match(sf.getFullText(), /\n {4}return 1\n/)
    })

    it("converts space indent to a tab when indent=tab", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("tab.ts", ["function f() {", "    return 1", "}", ""].join("\n"))
        await refineFormat(project, {log, dryRun: true, paths: [], indent: "tab", organizeImports: "off", report: {}})
        assert.match(sf.getFullText(), /\n\treturn 1\n/)
    })

    it("does not rewrite indent inside a template literal", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("c.ts", ["function f() {", "  const s = `", "    indented inside template", "    other inside template", "  `", "  return s", "}", ""].join("\n"))
        await refineFormat(project, opts(4))
        const lines = sf.getFullText().split("\n")
        // Code lines (outside template) are rewritten to 4-space.
        assert.equal(lines[0], "function f() {")
        assert.equal(lines[1], "    const s = `")
        assert.equal(lines[5], "    return s")
        assert.equal(lines[6], "}")
        // Template-content lines retain their original leading whitespace
        // because their first character sits inside the template span.
        assert.equal(lines[2], "    indented inside template")
        assert.equal(lines[3], "    other inside template")
        assert.equal(lines[4], "  `")
    })

    it("leaves JSDoc continuation lines (` * ...`) alone", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("d.ts", ["/**", " * docs", " */", "function f() {", "  return 1", "}", ""].join("\n"))
        await refineFormat(project, opts(4))
        const text = sf.getFullText()
        assert.match(text, /\n \* docs\n/)
        assert.match(text, /\n {4}return 1\n/)
    })

    it("is a no-op when the source already matches the target", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("e.ts", ["function f() {", "    return 1", "}", ""].join("\n"))
        const before = sf.getFullText()
        await refineFormat(project, opts(4))
        assert.equal(sf.getFullText(), before)
    })

    it("normalizes binary-operator continuation lines to the parent block's indent level", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        // LS re-indents continuation lines (parent block + continuation
        // step). Hand-rolled alignment such as the 5-space `     2` below
        // is not preserved; Prettier matches.
        const sf = project.createSourceFile("f.ts", ["function f() {", "  const x = 1 +", "     2", "}", ""].join("\n"))
        await refineFormat(project, opts(4))
        const lines = sf.getFullText().split("\n")
        assert.equal(lines[1], "    const x = 1 +")
        // Two indent levels: one for the function body, one for the
        // binary-operator continuation. Original 5-space alignment is lost.
        assert.equal(lines[2], "        2")
    })
})

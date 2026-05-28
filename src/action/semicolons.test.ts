import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {hasAsiHazardAfter, runSemicolons} from "./semicolons.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/semicolons-mixed/tsconfig.json")

function findFile(project: Project, suffix: string) {
    return project.getSourceFiles().find((sf) => sf.getFilePath().endsWith(suffix))
}

function semiLineCount(text: string) {
    // Count statement lines (lines starting with `const ` after trim) and how
    // many end with `;`. Keeps the assertion simple and avoids re-parsing.
    let total = 0
    let withSemi = 0
    for (const raw of text.split("\n")) {
        const line = raw.trim()
        if (!line.startsWith("const ")) continue
        total++
        if (line.endsWith(";")) withSemi++
    }
    return {total, withSemi}
}

describe("hasAsiHazardAfter", () => {
    it("treats array/call/op/regex/template/dot/comma starts as hazardous across newlines", () => {
        for (const ch of ["[", "(", "+", "-", "/", "`", ".", ","]) {
            assert.equal(hasAsiHazardAfter(`a;\n${ch}foo`, 2), true, `next-line "${ch}" should be hazardous`)
        }
    })

    it("treats an identifier on the next line as safe", () => {
        assert.equal(hasAsiHazardAfter("a;\nconst b = 1", 2), false)
    })

    it("treats EOF as safe", () => {
        assert.equal(hasAsiHazardAfter("a;", 2), false)
        assert.equal(hasAsiHazardAfter("a;\n", 2), false)
    })

    it("keeps `;` when the next token is on the same line and not `}`", () => {
        assert.equal(hasAsiHazardAfter("a; b", 2), true)
    })

    it("allows deletion when the next same-line token is `}`", () => {
        assert.equal(hasAsiHazardAfter("a; }", 2), false)
    })

    it("skips line and block comments before deciding", () => {
        assert.equal(hasAsiHazardAfter("a;\n// note\n[0]", 2), true)
        assert.equal(hasAsiHazardAfter("a;\n/* note */\n[0]", 2), true)
        assert.equal(hasAsiHazardAfter("a;\n// note\nb", 2), false)
    })
})

describe("runSemicolons remove (dry-run, sample/semicolons-mixed)", () => {
    it("strips every trailing `;` from ASI-eligible statements in-memory", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        await runSemicolons(project, {dryRun: true, absIncludes: [], absExcludes: [], semicolons: "off"})

        // all-semi.ts and mixed.ts must end up with no trailing `;` on const lines.
        for (const suffix of ["/all-semi.ts", "/mixed.ts"]) {
            const sf = findFile(project, suffix)!
            const c = semiLineCount(sf.getFullText())
            assert.ok(c.total > 0, `${suffix} should have const statements (got ${c.total})`)
            assert.equal(c.withSemi, 0, `${suffix} should end up with 0 trailing ; (got ${c.withSemi}/${c.total})`)
        }

        // no-semi.ts was already without `;` and must remain untouched.
        const noSemi = findFile(project, "/no-semi.ts")!
        const before = noSemi.getFullText()
        assert.equal(semiLineCount(before).withSemi, 0)
    })
})

describe("runSemicolons insert (dry-run, sample/semicolons-mixed)", () => {
    it("appends `;` to every ASI-eligible statement lacking one", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        await runSemicolons(project, {dryRun: true, absIncludes: [], absExcludes: [], semicolons: "on"})

        // no-semi.ts and mixed.ts must converge on full-`;` on const lines.
        for (const suffix of ["/no-semi.ts", "/mixed.ts"]) {
            const sf = findFile(project, suffix)!
            const c = semiLineCount(sf.getFullText())
            assert.ok(c.total > 0, `${suffix} should have const statements (got ${c.total})`)
            assert.equal(c.withSemi, c.total, `${suffix} should end up with every ; present (got ${c.withSemi}/${c.total})`)
        }

        // all-semi.ts already had every `;` and must remain in that state.
        const allSemi = findFile(project, "/all-semi.ts")!
        const c = semiLineCount(allSemi.getFullText())
        assert.equal(c.withSemi, c.total)
    })
})

describe("runSemicolons remove handles nested ASI-eligible statements", () => {
    it("strips `;` from describe/it/assert blocks without overflowing offsets", async () => {
        // Regression: forEachDescendant visits parent before child, so a naive
        // reverse-array iteration tried to edit the outer call's end position
        // after the inner statement's `;` had already shifted the file. Sorting
        // targets by end descending fixes the order; this test pins it.
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("nest.ts", ["describe('outer', () => {", "  it('inner', () => {", "    const x = 1;", "    inner(x);", "  });", "});"].join("\n"))

        await runSemicolons(project, {dryRun: true, absIncludes: [], absExcludes: [], semicolons: "off"})

        const text = sf.getFullText()
        assert.equal(text.includes("const x = 1;"), false, "inner const lost its ;")
        assert.equal(text.includes("inner(x);"), false, "inner call lost its ;")
        // The outer describe/it expression statements must also have lost the `;`
        // after the closing `})`; check by ensuring no `;` remains in the file.
        assert.equal(text.includes(";"), false, "no `;` should remain in the file")
    })
})

describe("runSemicolons remove keeps `;` at ASI-hazard sites", () => {
    it("retains `;` before a method-chain continuation on the next line", async () => {
        // Generate an inline fixture project so the hazard can be exercised
        // without polluting sample/. Uses an in-memory file system.
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile(
            "hazard.ts",
            [
                "const x = 1;", // hazardous: next non-trivia is `.`
                ".toString();", // expression statement
                "const y = 2;", // safe: next non-trivia is `const`
                "const z = 3;", // safe: next non-trivia is EOF
            ].join("\n"),
        )

        await runSemicolons(project, {dryRun: true, absIncludes: [], absExcludes: [], semicolons: "off"})

        const text = sf.getFullText()
        // The hazardous line must keep its `;` to avoid fusing into `1.toString()`.
        assert.match(text, /const x = 1;\n\.toString\(\)/)
        // Safe lines lose their `;`.
        assert.match(text, /const y = 2\n/)
        assert.match(text, /const z = 3$/)
    })
})

describe("runSemicolons remove preserves grammar-required semicolons", () => {
    it("keeps the trailing `;` on do-while statements", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        const sf = project.createSourceFile("do-while.ts", ["let x = 0;", "do {", "  x++", "} while (x < 2);", "const y = x;"].join("\n"))

        await runSemicolons(project, {dryRun: true, absIncludes: [], absExcludes: [], semicolons: "off"})

        const text = sf.getFullText()
        assert.match(text, /} while \(x < 2\);/)
        assert.match(text, /let x = 0\n/)
        assert.match(text, /const y = x$/)
    })
})

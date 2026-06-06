// Semicolons-action coverage retargeted at refineFormat({semicolons}).
// hasAsiHazardAfter tests are retired with the detector function itself.

import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {initInMemoryProject} from "../common/init-project.ts"
import {initTestProject} from "../test-utils/init-test-project.ts"
import {refineFormat} from "./refine-format.ts"

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

// Shared dry-run options for the semicolons fixtures (format no longer
// organizes imports, so the comparison stays focused on semicolons).
const SEMI_OFF = {dryRun: true, paths: [] as string[]}

const log = {write: (): void => undefined}

describe("refineFormat --semi off (dry-run, sample/semicolons-mixed)", () => {
    it("strips every trailing `;` from ASI-eligible statements in-memory", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        await refineFormat({project, log, ...SEMI_OFF, style: {semi: "off"}})

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

describe("refineFormat --semi on (dry-run, sample/semicolons-mixed)", () => {
    it("appends `;` to every ASI-eligible statement lacking one", async () => {
        const project = initTestProject(SAMPLE_TSCONFIG)
        await refineFormat({project, log, ...SEMI_OFF, style: {semi: "on"}})

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

describe("refineFormat --semi off handles nested ASI-eligible statements", () => {
    it("strips `;` from describe/it/assert blocks without overflowing offsets", async () => {
        // Original regression motivation: a parent-before-child visitor
        // with naive reverse iteration over-shifted the file. The LS
        // formatter computes a single edit set so the offset hazard is
        // structurally absent; the test still pins the visible outcome.
        const project = initInMemoryProject()
        const sf = project.createSourceFile("nest.ts", ["describe('outer', () => {", "  it('inner', () => {", "    const x = 1;", "    inner(x);", "  });", "});"].join("\n"))

        await refineFormat({project, log, ...SEMI_OFF, style: {semi: "off"}})

        const text = sf.getFullText()
        assert.equal(text.includes("const x = 1;"), false, "inner const lost its ;")
        assert.equal(text.includes("inner(x);"), false, "inner call lost its ;")

        // The outer describe/it expression statements must also have lost the `;`
        // after the closing `})`; check by ensuring no `;` remains in the file.
        assert.equal(text.includes(";"), false, "no `;` should remain in the file")
    })
})

describe("refineFormat --semi off keeps `;` at ASI-hazard sites", () => {
    it("retains `;` before a method-chain continuation on the next line", async () => {
        // The LS rule isSemicolonDeletionContext is the original source the
        // self-implemented detector was modeled on; this test pins that the
        // LS path still treats `\n.toString()` as a hazard.
        const project = initInMemoryProject()
        const sf = project.createSourceFile(
            "hazard.ts",
            [
                "const x = 1;", // hazardous: next non-trivia is `.`
                ".toString();", // expression statement
                "const y = 2;", // safe: next non-trivia is `const`
                "const z = 3;", // safe: next non-trivia is EOF
            ].join("\n"),
        )

        await refineFormat({project, log, ...SEMI_OFF, style: {semi: "off"}})

        const text = sf.getFullText()

        // The hazardous line must keep its `;` to avoid fusing into `1.toString()`.
        assert.match(text, /const x = 1;\n\.toString\(\)/)

        // Safe lines lose their `;`. The LS adds a trailing newline to
        // each formatted file, so the last-line anchor needs to allow it.
        assert.match(text, /const y = 2\n/)
        assert.match(text, /const z = 3\n?$/)
    })
})

describe("refineFormat --semi off and do-while statements", () => {
    it("removes the trailing `;` after `} while (...)` (LS divergence from the old hand-rolled action)", async () => {
        // The LS deletion-context rule does not exempt do-while; the
        // retired hand-rolled filter did. Pinned as the LS outcome.
        const project = initInMemoryProject()
        const sf = project.createSourceFile("do-while.ts", ["let x = 0;", "do {", "  x++", "} while (x < 2);", "const y = x;"].join("\n"))

        await refineFormat({project, log, ...SEMI_OFF, style: {semi: "off"}})

        const text = sf.getFullText()

        // Old action: `} while (x < 2);` retained. LS: `;` stripped.
        assert.match(text, /} while \(x < 2\)\n/)
        assert.match(text, /let x = 0\n/)
        assert.match(text, /const y = x\n?$/)
    })
})

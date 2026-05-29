import {strict as assert} from "node:assert"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {describe, it} from "node:test"

const CLI = path.resolve(import.meta.dirname, "./cli.ts")
const SAMPLE = path.resolve(import.meta.dirname, "../sample/basic/tsconfig.json")

function run(args: string[]): {status: number | null; stdout: string; stderr: string} {
    const r = spawnSync(process.execPath, [CLI, ...args], {encoding: "utf8"})
    return {status: r.status, stdout: r.stdout, stderr: r.stderr}
}

describe("cli", () => {
    it("prints usage for help, -h, --help, and no args", () => {
        for (const args of [["help"], ["-h"], ["--help"], []]) {
            const r = run(args)
            assert.equal(r.status, 0, `args: ${args.join(" ")}`)
            assert.match(r.stdout, /Usage: ts-survey <command>/)
            assert.match(r.stdout, /report \[reports\.\.\.\]/)
            assert.match(r.stdout, /^  reformat /m)
            assert.match(r.stdout, /^  ls /m)
            assert.match(r.stdout, /--output <name>/)
            assert.match(r.stdout, /--organize-imports on\|off/)
        }
    })

    it("runs the report subcommand and prints Markdown", () => {
        const r = run(["report", "semicolons", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stdout, /### semicolons/)
    })

    it("emits a prettier config via report --output prettier", () => {
        const r = run(["report", "--output", "prettier", "-p", SAMPLE])
        assert.equal(r.status, 0)
        // Output is JSON, not Markdown.
        assert.doesNotMatch(r.stdout, /^### /m)
        assert.match(r.stdout, /^\{/)
    })

    it("applies via the reformat subcommand (dry-run)", () => {
        const r = run(["reformat", "--dry-run", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stderr, /apply: would change/)
    })

    it("lists files via the ls subcommand", () => {
        const r = run(["ls", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stdout, /^\| file \| exports \| unused \| importers \|/m)
    })

    it("leads the default survey with the ls cleanup-candidate section", () => {
        const r = run(["report", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stdout, /^### ls --no-exports --no-importers --unused-exports$/m)
        // The ls section precedes the first report table.
        assert.ok(r.stdout.indexOf("### ls ") < r.stdout.indexOf("### unused-exports"))
    })

    it("exits non-zero on an unknown command", () => {
        const r = run(["frobnicate", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /unknown command/)
    })
})

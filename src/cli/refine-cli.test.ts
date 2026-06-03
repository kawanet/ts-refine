import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {refineCLI} from "./refine-cli.ts"

const SAMPLE = path.resolve(import.meta.dirname, "../../sample/basic/tsconfig.json")

// Drive refineCLI in-process: collect what it writes to the stdout stream and
// to the log sink (diagnostics + the runners' summary lines). A rejection is
// surfaced the way a caller would: its message becomes stderr and the status
// becomes 1.
async function run(args: string[]): Promise<{status: number; stdout: string; stderr: string}> {
    const out: string[] = []
    const errs: string[] = []
    const output = {write: (s: string): void => void out.push(s)}
    const log = {write: (s: string): void => void errs.push(s)}
    try {
        const status = await refineCLI({args: {}, tokens: args, output, log})
        return {status, stdout: out.join(""), stderr: errs.join("")}
    } catch (e) {
        errs.push(e instanceof Error ? e.message : String(e))
        return {status: 1, stdout: out.join(""), stderr: errs.join("")}
    }
}

describe("refineCLI", () => {
    it("prints usage for help, -h, --help, and no args", async () => {
        for (const args of [["help"], ["-h"], ["--help"], []]) {
            const r = await run(args)
            assert.equal(r.status, 0, `args: ${args.join(" ")}`)
            assert.match(r.stdout, /Usage: ts-refine <command>/)
            assert.match(r.stdout, /report \[--<report>\.\.\.\]/)
            assert.match(r.stdout, /^  format /m)
            assert.match(r.stdout, /^  list /m)
            assert.match(r.stdout, /^  inspect /m)
            assert.match(r.stdout, /^  move /m)
            assert.match(r.stdout, /^  rename /m)
            assert.match(r.stdout, /^  imports /m)
            assert.match(r.stdout, /--emit <name>/)
            assert.match(r.stdout, /--semicolons --indent --member-separators --new-line --bracket-spacing/)
            assert.match(r.stdout, /--exports --importers/)
        }
    })

    it("runs the report subcommand and prints Markdown", async () => {
        const r = await run(["report", "--semicolons", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stdout, /### semicolons/)
    })

    it("errors on a target path that matches no project file", async () => {
        const r = await run(["list", "not-found.ts", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /no project files matched/)
    })

    it("emits a prettier config via report --emit prettier", async () => {
        const r = await run(["report", "--emit", "prettier", "-p", SAMPLE])
        assert.equal(r.status, 0)

        // Output is JSON, not Markdown.
        assert.doesNotMatch(r.stdout, /^### /m)
        assert.match(r.stdout, /^\{/)
    })

    it("applies via the format subcommand (dry-run)", async () => {
        const r = await run(["format", "--dry-run", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stderr, /format: would change/)

        // format never consumes member-separators, so it is not surveyed.
        assert.doesNotMatch(r.stderr, /report member-separators:/)
    })

    it("skips surveying a field that a format override already pins", async () => {
        const r = await run(["format", "--indent", "4", "--dry-run", "-p", SAMPLE])
        assert.equal(r.status, 0)

        // --indent pins indent, so its survey is skipped; the rest still run.
        assert.doesNotMatch(r.stderr, /report indent:/)
        assert.match(r.stderr, /report semicolons:/)
    })

    it("exits non-zero with a fix hint when format --check finds changes", async () => {
        const r = await run(["format", "--check", "-p", SAMPLE])
        assert.notEqual(r.status, 0)

        // --check writes nothing (would-change), then points at the fix.
        assert.match(r.stderr, /format: would change/)
        assert.match(r.stderr, /Run `ts-refine format` to fix\./)
    })

    it("renames an exported identifier via the rename subcommand (dry-run)", async () => {
        const r = await run(["rename", "--from", "usedFn", "--to", "renamedFn", "-p", SAMPLE, "--dry-run"])
        assert.equal(r.status, 0)
        assert.match(r.stderr, /rename: would rename usedFn -> renamedFn/)
    })

    it("errors when rename is missing --from / --to", async () => {
        const r = await run(["rename", "--from", "usedFn", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /requires --from <name> and --to <name>/)
    })

    it("organizes imports via the imports subcommand (dry-run)", async () => {
        const r = await run(["imports", "--dry-run", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stderr, /imports: would change/)
    })

    it("rejects style override flags on the imports subcommand", async () => {
        const r = await run(["imports", "--semicolons", "off", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /unknown option/)
    })

    it("lists files via the list subcommand", async () => {
        const r = await run(["list", "-p", SAMPLE])
        assert.equal(r.status, 0)
        assert.match(r.stdout, /^\| file \| exports \| unused \| importers \|/m)
    })

    it("opens the default survey with the first report table, not a list section", async () => {
        const r = await run(["report", "-p", SAMPLE])
        assert.equal(r.status, 0)

        // The survey no longer embeds a list cleanup-candidate section; use
        // `list --unused-exports` for that on demand.
        assert.doesNotMatch(r.stdout, /^### list /m)
        assert.match(r.stdout, /^### semicolons$/m)
    })

    it("inspects files via the inspect subcommand", async () => {
        const r = await run(["inspect", "--exports", "-p", SAMPLE, "src/used.ts"])
        assert.equal(r.status, 0)

        // One file heading, then the exports table.
        assert.match(r.stdout, /^## sample\/basic\/src\/used\.ts$/m)
        assert.match(r.stdout, /^### exports$/m)
        assert.match(r.stdout, /^\| line \| kind \| name \| importers \| example \|/m)
    })

    it("accepts -p on either side of the subcommand", async () => {
        const left = await run(["-p", SAMPLE, "report", "--semicolons"])
        assert.equal(left.status, 0)
        assert.match(left.stdout, /### semicolons/)
        const right = await run(["report", "--semicolons", "-p", SAMPLE])
        assert.equal(right.status, 0)
        assert.match(right.stdout, /### semicolons/)
    })

    it("rejects -p duplicated across the subcommand", async () => {
        const r = await run(["-p", SAMPLE, "report", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /cannot be combined with another tsconfig path/)
    })

    it("exits non-zero on an unknown command", async () => {
        const r = await run(["frobnicate", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /unknown command/)
    })

    it("rejects --help combined with a subcommand (until per-command help exists)", async () => {
        // Both trailing `<command> --help` and leading `--help <command>` reach
        // the handler, which reports the flag as unsupported rather than help.
        for (const args of [
            ["report", "--help"],
            ["-h", "format", "-p", SAMPLE],
        ]) {
            const r = await run(args)
            assert.notEqual(r.status, 0, `args: ${args.join(" ")}`)
            assert.match(r.stderr, /--help is not supported/)
        }
    })

    it("names a leading-dash token back as an unknown command", async () => {
        const r = await run(["--emit", "prettier", "-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /unknown command: --emit/)
    })

    it("treats globals with no subcommand as a usage error, not help", async () => {
        const r = await run(["-p", SAMPLE])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /expected a subcommand/)
    })

    it("rejects --dry-run on a read command, wherever it sits", async () => {
        const r1 = await run(["report", "--dry-run", "-p", SAMPLE])
        assert.notEqual(r1.status, 0)
        assert.match(r1.stderr, /--dry-run is not valid for the report command/)
        const r2 = await run(["--dry-run", "report", "-p", SAMPLE])
        assert.notEqual(r2.status, 0)
        assert.match(r2.stderr, /--dry-run is not valid for the report command/)
    })
})

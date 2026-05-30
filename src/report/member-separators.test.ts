import {strict as assert} from "node:assert"
import path from "node:path"
import {describe, it} from "node:test"
import {Project} from "ts-morph"
import {runReportMemberSeparators} from "./member-separators.ts"

const SAMPLE_TSCONFIG = path.resolve(import.meta.dirname, "../../sample/members-mixed/tsconfig.json")

describe("runReportMemberSeparators (sample/members-mixed)", () => {
    it("groups files by primary separator and recommends the file-count majority", async () => {
        const project = new Project({tsConfigFilePath: SAMPLE_TSCONFIG})
        const lines: string[] = []
        await runReportMemberSeparators(project, {stream: {write: (l) => lines.push(l)}, paths: []})

        const out = lines.join("")
        assert.match(out, /^### member-separators\n/)

        // all-none.ts:   3 members → primary `\n` (lines=3)
        // none-extra.ts: 2 members → primary `\n` (lines=2)
        // all-comma.ts:  3 members → primary `,`  (lines=3)
        // all-semi.ts:   3 members → primary `;`  (lines=3)
        // with-class.ts: 2 properties + 1 method body (skipped) → primary `;` (lines=2)
        // no-members.ts: skipped (no interface/class)
        assert.match(out, /\| `\\n` \| 5 \| 2 \| sample\/members-mixed\/src\/all-none\.ts \|/)
        assert.match(out, /\| `,` \| 3 \| 1 \| sample\/members-mixed\/src\/all-comma\.ts \|/)
        assert.match(out, /\| `;` \| 5 \| 2 \| sample\/members-mixed\/src\/all-semi\.ts \|/)
        assert.match(out, /\| total \| 13 \| 5 \| \|/)

        // The newline-only and semi buckets both hold 2 files, so the
        // tie produces no recommendation — the choice is the user's.
        assert.equal(/^recommendation:/m.test(out), false)
        assert.equal(/no-members\.ts/.test(out), false)
    })

    it("issues a recommendation when one separator strictly leads on file count", async () => {
        // Synthesize a project where `;` strictly leads.
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("a.ts", "export interface A {\n    a: number;\n    b: number;\n}\n")
        project.createSourceFile("b.ts", "export interface B {\n    a: number;\n    b: number;\n}\n")
        project.createSourceFile("c.ts", "export interface C {\n    a: number,\n}\n")
        const lines: string[] = []
        const ret = await runReportMemberSeparators(project, {stream: {write: (l) => lines.push(l)}, paths: []})
        const out = lines.join("")
        // Recommendation is no longer inlined in the Markdown.
        assert.equal(/^recommendation:/m.test(out), false)
        assert.deepEqual(ret, {separator: "semi"})
    })

    it("breaks a file-count tie by the higher member count and emits a recommendation", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        // 1 file with 5 `;` members vs 1 file with 1 `,` member.
        project.createSourceFile("a.ts", "export interface A {\n    a: number;\n    b: number;\n    c: number;\n    d: number;\n    e: number;\n}\n")
        project.createSourceFile("b.ts", "export interface B {\n    a: number,\n}\n")
        const lines: string[] = []
        const ret = await runReportMemberSeparators(project, {stream: {write: (l) => lines.push(l)}, paths: []})
        assert.deepEqual(ret, {separator: "semi"})
    })

    it("returns an empty partial when files AND member counts both tie", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("a.ts", "export interface A {\n    a: number;\n    b: number;\n}\n")
        project.createSourceFile("b.ts", "export interface B {\n    a: number,\n    b: number,\n}\n")
        const lines: string[] = []
        const ret = await runReportMemberSeparators(project, {stream: {write: (l) => lines.push(l)}, paths: []})
        assert.deepEqual(ret, {})
    })

    it("skips method bodies (members ending in `}`) so they do not inflate the `\\n` bucket", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("m.ts", "export class M {\n    x() { return 1 }\n    y() { return 2 }\n}\n")
        const lines: string[] = []
        await runReportMemberSeparators(project, {stream: {write: (l) => lines.push(l)}, paths: []})
        const out = lines.join("")
        // No members remain after the `}`-trailing skip; the file should
        // not be counted.
        assert.match(out, /\| total \| 0 \| 0 \| \|/)
        // `\n` and `;` keep a 0-row; `,` is omitted when absent.
        assert.match(out, /\| `\\n` \| 0 \| 0 \|\|/)
        assert.match(out, /\| `;` \| 0 \| 0 \|\|/)
        assert.equal(/\| `,` \|/.test(out), false)
    })

    it("counts class properties whose initializer ends with an object literal", async () => {
        const project = new Project({useInMemoryFileSystem: true})
        project.createSourceFile("props.ts", "export class Props {\n    config = {}\n    fn = function () {}\n    semi = {};\n}\n")
        const lines: string[] = []
        await runReportMemberSeparators(project, {stream: {write: (l) => lines.push(l)}, paths: []})
        const out = lines.join("")

        assert.match(out, /\| `\\n` \| 2 \| 1 \| props\.ts \|/)
        assert.match(out, /\| total \| 2 \| 1 \| \|/)
    })
})

import {strict as assert} from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {describe, it} from "node:test"
import {displayPath} from "./source-files.ts"

describe("displayPath", () => {
    it("keeps a single leading parent segment as useful context", () => {
        // realpathSync resolves macOS's /var -> /private/var symlink so the
        // tmpdir path lines up with what process.cwd() returns after chdir.
        const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-refine-display-")))
        const prev = process.cwd()
        try {
            const cwd = path.join(root, "work")
            fs.mkdirSync(cwd)
            process.chdir(cwd)
            assert.equal(displayPath(path.join(root, "sibling", "file.ts")), path.join("..", "sibling", "file.ts"))
        } finally {
            process.chdir(prev)
            fs.rmSync(root, {recursive: true, force: true})
        }
    })

    it("strips everything through the last parent segment in long relative paths", () => {
        // realpathSync resolves macOS's /var -> /private/var symlink so the
        // tmpdir path lines up with what process.cwd() returns after chdir.
        const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-refine-display-")))
        const prev = process.cwd()
        try {
            const cwd = path.join(root, "batch", "runner")
            fs.mkdirSync(cwd, {recursive: true})
            process.chdir(cwd)
            assert.equal(displayPath(path.join(root, "project", "src", "file.ts")), path.join("project", "src", "file.ts"))
        } finally {
            process.chdir(prev)
            fs.rmSync(root, {recursive: true, force: true})
        }
    })
})

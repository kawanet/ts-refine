// Persistence backend for a Project. Projects opened from a tsconfig use the
// real host fs; the lib-less projects the format separator pass and tests spin
// up use the in-memory variant. The language service reads file contents
// through its own host (language-service-host.ts); this interface covers only
// the disk-facing operations the library performs directly.

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import {normalizePath} from "./paths.ts"

export interface FileSystemHost {
    // Whether the backing store keeps file contents in memory rather than on
    // disk. move() consults this to decide if an in-memory source dropped by a
    // relocation still needs an on-disk delete.
    readonly isInMemory: boolean
    readFileSync(filePath: string): string
    writeFile(filePath: string, content: string): Promise<void>
    writeFileSync(filePath: string, content: string): void
    delete(filePath: string): Promise<void>
    fileExistsSync(filePath: string): boolean
    directoryExistsSync(dirPath: string): boolean
}

// Real filesystem backend. Reads stay synchronous (the language service host is
// synchronous); writes/deletes are async so callers can await durability.
export class RealFileSystemHost implements FileSystemHost {
    readonly isInMemory = false

    readFileSync(filePath: string): string {
        return fs.readFileSync(filePath, "utf8")
    }

    // A move can target a directory that does not exist yet, so the parent is
    // created before writing — matching the manipulation library's save.
    async writeFile(filePath: string, content: string): Promise<void> {
        await fsp.mkdir(path.dirname(filePath), {recursive: true})
        await fsp.writeFile(filePath, content)
    }

    writeFileSync(filePath: string, content: string): void {
        fs.mkdirSync(path.dirname(filePath), {recursive: true})
        fs.writeFileSync(filePath, content)
    }

    async delete(filePath: string): Promise<void> {
        await fsp.rm(filePath, {force: true, recursive: true})
    }

    fileExistsSync(filePath: string): boolean {
        try {
            return fs.statSync(filePath).isFile()
        } catch {
            return false
        }
    }

    directoryExistsSync(dirPath: string): boolean {
        try {
            return fs.statSync(dirPath).isDirectory()
        } catch {
            return false
        }
    }
}

// In-memory backend: a flat path→content map. Directories are implied by the
// files under them, so directoryExistsSync reports true once any file lives
// beneath the path — enough for the move command's destination checks.
export class InMemoryFileSystemHost implements FileSystemHost {
    readonly isInMemory = true
    private readonly files = new Map<string, string>()

    readFileSync(filePath: string): string {
        const text = this.files.get(normalizePath(filePath))
        if (text == null) throw new Error(`File not found in memory: ${filePath}`)
        return text
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        this.files.set(normalizePath(filePath), content)
    }

    writeFileSync(filePath: string, content: string): void {
        this.files.set(normalizePath(filePath), content)
    }

    async delete(filePath: string): Promise<void> {
        this.files.delete(normalizePath(filePath))
    }

    fileExistsSync(filePath: string): boolean {
        return this.files.has(normalizePath(filePath))
    }

    directoryExistsSync(dirPath: string): boolean {
        const prefix = normalizePath(dirPath) + "/"
        for (const f of this.files.keys()) if (f.startsWith(prefix)) return true
        return false
    }
}

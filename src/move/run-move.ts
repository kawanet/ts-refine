// `move`: relocate one or more .ts files and update every import path
// that targets them. ts-morph's sf.move() handles the path arithmetic
// for all import forms (value / type / namespace / re-export / dynamic)
// and preserves the surrounding text untouched; what it doesn't do is
// preserve the `.ts` extension in the rewritten module specifiers, so we
// snapshot the original `.ts` presence per specifier before the move and
// restore it after. No format pass runs — sf.move() is format-preserving
// on its own, and any cleanup (organize-imports, etc.) is the user's
// follow-up call to reformat.
//
// Migration ("everyone should use this extension style") is intentionally
// out of scope — that belongs in a separate subcommand. Each specifier
// keeps the extension state it had before the move.

import type * as declared from "@kawanet/ts-survey"
import fs from "node:fs"
import path from "node:path"
import {Node, type ExportDeclaration, type ImportDeclaration, type Project, type SourceFile, type StringLiteral, ts} from "ts-morph"

import {displayPath} from "../lib/source-files.ts"

// One captured module specifier whose target is moving. Held by AST node
// reference so it stays valid across sf.move() and can be patched in place.
// `originalExt` is the literal extension on the source-time specifier
// (".ts", ".js", ".mjs", ...) or "" for no extension — whatever the user
// wrote stays. ts-morph drops the extension during move and we put back
// exactly what was there originally.
type SpecRecord =
    | {kind: "import"; node: ImportDeclaration; originalExt: string}
    | {kind: "export"; node: ExportDeclaration; originalExt: string}
    | {kind: "dynamic"; node: StringLiteral; originalExt: string}

// File extensions TypeScript's module resolution recognizes for source
// files. We restore whichever of these the user wrote — `.js` etc. is
// just as much a "TS-resolvable" specifier in NodeNext / bundler.
const KNOWN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/

function extensionOf(specifier: string): string {
    const m = specifier.match(KNOWN_EXT)
    return m ? m[0] : ""
}

// Strip any known extension from the specifier and append `ext` (empty
// string for no extension). Idempotent when called with the current ext.
function withExtension(specifier: string, ext: string): string {
    return specifier.replace(KNOWN_EXT, "") + ext
}

export const runMove: typeof declared.runMove = async (project, opts) => {
    const {sources, dest, dryRun} = opts

    const plan = planMoves(project, sources, dest)

    // Pre-move snapshot: which in-project specifiers target a moving file
    // and whether they currently carry a `.ts` extension.
    const movingPaths = new Set(plan.map((p) => p.from))
    const records = snapshotSpecifiers(project, movingPaths)

    // Apply each move in turn. ts-morph keeps cross-file references in sync
    // — including the moved file's own outgoing relative paths.
    for (const {from, to} of plan) {
        project.getSourceFileOrThrow(from).move(to)
    }

    // Restore each specifier's original extension. ts-morph drops the
    // extension during move; this puts back exactly what the user wrote
    // (`.ts`, `.js`, `.mjs`, none, …) — no migration across styles.
    for (const r of records) restoreOriginalExtension(r)

    // Touched = every file whose contents changed: the moved files plus
    // any importer that held a recorded specifier.
    const destPaths = new Set(plan.map((p) => p.to))
    const touchedSet = new Set<string>(destPaths)
    for (const r of records) touchedSet.add(r.node.getSourceFile().getFilePath())

    // Dry-run: print planned moves + the importers that would change;
    // never touch disk. Otherwise let ts-morph persist moves and content
    // updates atomically via project.save().
    if (dryRun) {
        for (const {from, to} of plan) console.log(`would move: ${displayPath(from)} -> ${displayPath(to)}`)
        for (const p of touchedSet) {
            if (!destPaths.has(p)) console.log(`would update: ${displayPath(p)}`)
        }
    } else {
        await project.save()
    }

    const verb = dryRun ? "would move" : "moved"
    console.error(`move: ${verb} ${plan.length} file${plan.length === 1 ? "" : "s"} (${touchedSet.size} touched)`)

    return {
        moves: plan.map(({from, to}) => ({from, to})),
        touched: [...touchedSet],
    }
}

// Resolve sources/dest into a concrete from→to plan. Mirrors `mv`'s rules:
// a directory destination puts each source into it under its basename;
// a file destination only makes sense for a single source. Conflicts
// (duplicate dest, dest === a source, dest overlaps an existing project
// file that is not also being moved out) are rejected up-front so a bad
// invocation cannot silently overwrite a project file.
function planMoves(project: Project, sources: string[], dest: string): {from: string; to: string}[] {
    if (sources.length === 0) throw new Error("move: at least one source file is required")

    const destIsDir = isDirectoryDest(project, dest)
    if (sources.length > 1 && !destIsDir) {
        throw new Error(`move: destination must be an existing directory when moving multiple sources; got: ${dest}`)
    }

    const fromSet = new Set(sources)
    const toSet = new Set<string>()
    const seenSources = new Set<string>()
    const plan: {from: string; to: string}[] = []

    for (const src of sources) {
        if (!project.getSourceFile(src)) {
            throw new Error(`move: not in the project: ${src}`)
        }
        if (seenSources.has(src)) {
            throw new Error(`move: source listed twice: ${src}`)
        }
        seenSources.add(src)

        const to = destIsDir ? path.join(dest, path.basename(src)) : dest
        if (src === to) {
            throw new Error(`move: source and destination are the same: ${src}`)
        }
        if (toSet.has(to)) {
            throw new Error(`move: multiple sources map to the same destination: ${to}`)
        }
        // Overlap with an existing project file that isn't one of the
        // sources being moved away — would silently overwrite, so reject.
        if (!fromSet.has(to) && project.getSourceFile(to)) {
            throw new Error(`move: destination is an existing project file: ${to}`)
        }
        toSet.add(to)
        plan.push({from: src, to})
    }

    return plan
}

// Trailing `/` always means "directory" (UNIX convention). Otherwise
// check the project's filesystem first — ts-morph's in-memory FS is
// invisible to fs.statSync, so a public-API caller using an in-memory
// project would otherwise see real directories misclassified as renames.
// Fall back to the host filesystem for the common on-disk path.
function isDirectoryDest(project: Project, dest: string): boolean {
    if (dest.endsWith("/") || dest.endsWith(path.sep)) return true
    if (project.getFileSystem().directoryExistsSync(dest)) return true
    try {
        return fs.statSync(dest).isDirectory()
    } catch {
        return false
    }
}

// Walks every project source file (.d.ts excluded) and captures any
// specifier whose target is moving — or any outgoing specifier on a moving
// file itself, since ts-morph rewrites those too when the file relocates.
function snapshotSpecifiers(project: Project, movingPaths: Set<string>): SpecRecord[] {
    const records: SpecRecord[] = []

    for (const sf of project.getSourceFiles()) {
        const filePath = sf.getFilePath()
        if (filePath.endsWith(".d.ts")) continue
        const isMoving = movingPaths.has(filePath)

        for (const decl of sf.getImportDeclarations()) {
            const target = decl.getModuleSpecifierSourceFile()
            if (!target) continue
            if (!isMoving && !movingPaths.has(target.getFilePath())) continue
            records.push({kind: "import", node: decl, originalExt: extensionOf(decl.getModuleSpecifierValue())})
        }
        for (const decl of sf.getExportDeclarations()) {
            const specifier = decl.getModuleSpecifierValue()
            if (specifier === undefined) continue
            const target = decl.getModuleSpecifierSourceFile()
            if (!target) continue
            if (!isMoving && !movingPaths.has(target.getFilePath())) continue
            records.push({kind: "export", node: decl, originalExt: extensionOf(specifier)})
        }
        for (const call of sf.getDescendantsOfKind(ts.SyntaxKind.CallExpression)) {
            if (call.getExpression().getKindName() !== "ImportKeyword") continue
            const arg = call.getArguments()[0]
            if (!arg || !Node.isStringLiteral(arg)) continue
            const target = resolveDynamicTarget(sf, arg.getLiteralValue(), project)
            if (!target) continue
            if (!isMoving && !movingPaths.has(target.getFilePath())) continue
            records.push({kind: "dynamic", node: arg, originalExt: extensionOf(arg.getLiteralValue())})
        }
    }

    return records
}

function restoreOriginalExtension(r: SpecRecord): void {
    if (r.kind === "import") {
        const spec = r.node.getModuleSpecifierValue()
        const next = withExtension(spec, r.originalExt)
        if (next !== spec) r.node.setModuleSpecifier(next)
    } else if (r.kind === "export") {
        const spec = r.node.getModuleSpecifierValue()
        if (spec === undefined) return
        const next = withExtension(spec, r.originalExt)
        if (next !== spec) r.node.setModuleSpecifier(next)
    } else {
        const val = r.node.getLiteralValue()
        const next = withExtension(val, r.originalExt)
        if (next !== val) r.node.setLiteralValue(next)
    }
}

// Resolve a dynamic import literal to a project SourceFile. The literal
// may include `.ts`, `.js`, `.mjs`, etc. (TypeScript's bundler/NodeNext
// resolution treats `./x.js` as pointing at `x.ts` when the latter is the
// real source); we try the literal as-given first, then rewrite any
// known extension to `.ts` to find the source file.
function resolveDynamicTarget(from: SourceFile, specifier: string, project: Project): SourceFile | undefined {
    if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return undefined
    const baseDir = from.getDirectoryPath()
    const absolute = path.isAbsolute(specifier) ? specifier : path.resolve(baseDir, specifier)
    return (
        project.getSourceFile(absolute) ??
        project.getSourceFile(withExtension(absolute, ".ts")) ??
        (extensionOf(absolute) === "" ? project.getSourceFile(absolute + ".ts") : undefined)
    )
}

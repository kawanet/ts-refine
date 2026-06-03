// `move`: relocate one or more .ts files and update every import path
// that targets them. ts-morph's sf.move() handles the path arithmetic
// for all import forms (value / type / namespace / re-export / dynamic)
// and preserves the surrounding text untouched; what it doesn't do is
// preserve the `.ts` extension in the rewritten module specifiers, so we
// snapshot the original `.ts` presence per specifier before the move and
// restore it after. After the moves, organizeImports re-sorts the import
// block of each file whose imports actually changed (and only those), using
// the project-wide surveyed style so the touched files converge on the
// codebase's conventions. Files with no import change are never reformatted;
// they get unified later by `format`. No full format pass runs here.
//
// Migration ("everyone should use this extension style") is intentionally
// out of scope — that belongs in a separate subcommand. Each specifier
// keeps the extension state it had before the move.

import fs from "node:fs"
import path from "node:path"
import {type ExportDeclaration, type ImportDeclaration, Node, type Project, type SourceFile, type StringLiteral, ts} from "ts-morph"
import type * as declared from "ts-refine"
import {resolveProject} from "../common/init-project.ts"
import {logging} from "../common/logging.ts"
import {surveyImportStyles} from "../lib/organize-changed.ts"
import {applyOrganizeImports} from "../lib/organize-imports.ts"
import {displayPath, inProjectSourceFiles} from "../lib/source-files.ts"

// One captured module specifier whose target is moving. Held by AST node
// reference so it stays valid across sf.move() and can be patched in place.
// `originalExt` is the literal extension on the source-time specifier
// (".ts", ".js", ".mjs", ...) or "" for no extension — whatever the user
// wrote stays. ts-morph drops the extension during move and we put back
// exactly what was there originally.
type SpecRecord = {kind: "import"; node: ImportDeclaration; originalExt: string} | {kind: "export"; node: ExportDeclaration; originalExt: string} | {kind: "dynamic"; node: StringLiteral; originalExt: string}

// Extensions a module specifier may carry that the move must preserve. The
// TS-resolvable family (`.js` etc. count under NodeNext / bundler) plus `.json`
// (resolveJsonModule), whose extension is mandatory — dropping it breaks the
// import.
const KNOWN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json)$/

function extensionOf(specifier: string): string {
    const m = specifier.match(KNOWN_EXT)
    return m ? m[0] : ""
}

// Strip any known extension from the specifier and append `ext` (empty
// string for no extension). Idempotent when called with the current ext.
function withExtension(specifier: string, ext: string): string {
    return specifier.replace(KNOWN_EXT, "") + ext
}

export const refineMove: typeof declared.refineMove = async (opts) => {
    const {sources, dest, dryRun, log} = opts
    const project = resolveProject(opts)

    const plan = planMoves(project, sources, dest)

    // Pre-move snapshot: which in-project specifiers target a moving file
    // and whether they currently carry a `.ts` extension.
    const movingPaths = new Set(plan.map((p) => p.from))
    const records = snapshotSpecifiers(project, movingPaths)

    // Sample each import-changed file's organize style from its pre-move state
    // (a moved file is surveyed at its original path, before relocation repaths
    // it). Deduped; `styleOf` is keyed by SourceFile so it survives move().
    const targetFiles = new Set(records.map((r) => r.node.getSourceFile()))
    const styleOf = await surveyImportStyles(targetFiles)

    // Apply each move in turn. ts-morph keeps cross-file references in sync
    // — including the moved file's own outgoing relative paths.
    for (const {from, to} of plan) {
        project.getSourceFileOrThrow(from).move(to)
    }

    // Restore each specifier's original extension. ts-morph drops the
    // extension during move; this puts back exactly what the user wrote
    // (`.ts`, `.js`, `.mjs`, none, …) — no migration across styles.
    for (const r of records) restoreOriginalExtension(r)

    // Touched = every source file whose contents changed: the moved
    // files (now at their dest paths) plus every importer that held a
    // recorded specifier.
    const destPaths = new Set(plan.map((p) => p.to))
    const touchedFiles = new Set<SourceFile>()
    for (const {to} of plan) {
        const sf = project.getSourceFile(to)
        if (sf) touchedFiles.add(sf)
    }
    for (const r of records) touchedFiles.add(r.node.getSourceFile())

    // Re-sort each import-changed file's import block (a relocation can reorder
    // specifiers), using the style sampled above. `targetFiles` is exactly the
    // surveyed set, so a moved file with no in-project import is never in it and
    // stays untouched; the `style` guard is a safety net for an unsurveyed file.
    for (const sf of targetFiles) {
        const style = styleOf(sf)
        if (style) applyOrganizeImports(sf, style)
    }

    // Dry-run: print planned moves + the importers that would change;
    // never touch disk. Otherwise persist only what we changed — call
    // sf.save() per touched file (respects the project's filesystem, so
    // an in-memory project stays in memory) and then delete each moved
    // file's OLD path. The save-then-delete order matters: if a save
    // fails partway, the originals are still on disk and the move is
    // recoverable; if we deleted first and a save failed, the original
    // file would be gone with no new copy to replace it. We deliberately
    // avoid project.save() either way, which would also flush unrelated
    // pending edits a caller may have queued up.
    if (!dryRun) {
        for (const sf of touchedFiles) await sf.save()
        const fileSystem = project.getFileSystem()
        for (const {from} of plan) {
            try {
                await fileSystem.delete(from)
            } catch {
                // Source already gone (e.g., ts-morph's in-memory FS
                // dropped it as part of move) — nothing to delete.
            }
        }
    }

    // Per-file progress on stderr (stdout is reserved for command results).
    // The verb tracks dryRun; moves and importer updates are two separate
    // streams. A moved file's new path is in destPaths, so the second loop
    // reports only the importers.
    for (const {from, to} of plan) {
        logging(log, `${dryRun ? "would move" : "moved"}: ${displayPath(from)} -> ${displayPath(to)}`)
    }
    for (const sf of touchedFiles) {
        const p = sf.getFilePath()
        if (!destPaths.has(p)) logging(log, `${dryRun ? "would update" : "updated"}: ${displayPath(p)}`)
    }

    const verb = dryRun ? "would move" : "moved"
    logging(log, `move: ${verb} ${plan.length} file${plan.length === 1 ? "" : "s"} (${touchedFiles.size} touched)`)

    return {
        moves: plan.map(({from, to}) => ({from, to})),
        touched: [...touchedFiles].map((sf) => sf.getFilePath()),
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

        // Overlap with an existing project file OR a file on the
        // project's filesystem that the tsconfig happens to exclude.
        // Either would be silently overwritten by sf.save(); reject both.
        if (!fromSet.has(to) && (project.getSourceFile(to) || project.getFileSystem().fileExistsSync(to))) {
            throw new Error(`move: destination already exists: ${to}`)
        }
        toSet.add(to)
        plan.push({from: src, to})
    }

    return plan
}

// Detect a directory destination in priority order: explicit trailing
// slash, ts-morph's filesystem view, project source-file layout, then
// host fs.statSync as the on-disk fallback.
function isDirectoryDest(project: Project, dest: string): boolean {
    if (dest.endsWith("/") || dest.endsWith(path.sep)) return true
    if (project.getFileSystem().directoryExistsSync(dest)) return true

    // ts-morph's in-memory FS does not register parent dirs until the
    // child file is saved; infer dir-ness from the source-file layout
    // so a fresh createSourceFile + refineMove flow still works.
    const prefix = dest + "/"
    for (const sf of inProjectSourceFiles(project)) {
        if (sf.getFilePath().startsWith(prefix)) return true
    }
    try {
        return fs.statSync(dest).isDirectory()
    } catch {
        return false
    }
}

// Walks every project source file and captures any specifier whose target
// is moving — or any outgoing specifier on a moving file itself, since
// ts-morph rewrites those too when the file relocates. `.d.ts` files are
// included so an ambient declaration that imports or re-exports a moving
// source still gets its specifier rewritten and saved.
function snapshotSpecifiers(project: Project, movingPaths: Set<string>): SpecRecord[] {
    const records: SpecRecord[] = []

    for (const sf of inProjectSourceFiles(project)) {
        const filePath = sf.getFilePath()
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
// may carry an emit-style extension (`.js` / `.jsx` / `.mjs` / `.cjs`),
// the .ts-family extension, or none — TypeScript's NodeNext / bundler
// resolution maps each to the corresponding TS source. We try the literal
// as-given first, then a small set of candidates that swap JS-family
// extensions for their TS-family counterparts.
function resolveDynamicTarget(from: SourceFile, specifier: string, project: Project): SourceFile | undefined {
    if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return undefined
    const baseDir = from.getDirectoryPath()
    const absolute = path.isAbsolute(specifier) ? specifier : path.resolve(baseDir, specifier)
    for (const candidate of dynamicTargetCandidates(absolute)) {
        const sf = project.getSourceFile(candidate)
        if (sf) return sf
    }
    return undefined
}

// JS-family → TS-family swap map for dynamic-import resolution. The
// resolver tries each candidate in turn; the first one that's a project
// source file wins.
const JS_TO_TS_SWAPS: Record<string, string[]> = {
    ".js": [".ts", ".tsx"],
    ".jsx": [".tsx"],
    ".mjs": [".mts"],
    ".cjs": [".cts"],
}

function dynamicTargetCandidates(absolute: string): string[] {
    const candidates = [absolute]
    const ext = extensionOf(absolute)
    const tsFamily = [".ts", ".tsx", ".mts", ".cts"]
    if (ext === "") {
        // No extension: every TS-family extension is a candidate, both as
        // a sibling file (`./feature.ts`) and as the directory's index
        // (`./feature/index.ts`).
        for (const tsExt of tsFamily) candidates.push(absolute + tsExt)
        for (const tsExt of tsFamily) candidates.push(path.join(absolute, "index" + tsExt))
    } else if (JS_TO_TS_SWAPS[ext]) {
        for (const tsExt of JS_TO_TS_SWAPS[ext]) candidates.push(withExtension(absolute, tsExt))
    }
    return candidates
}

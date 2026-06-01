// `inspect`: per-file analysis. The exports inspector returns one row per
// exported declaration (line / kind / name / importers count / example).
// The importers inspector returns one row per file that imports this one
// (collapsed across multiple import statements per importer), with the
// import kinds and the names brought in.
//
// The export iteration mirrors what the retired unused-exports report
// did — same getExportedDeclarations() / findReferencesAsNodes() pair —
// but it now drives a richer table rather than a "delete vs unexport"
// suggestion column.

import path from "node:path"
import {type ImportDeclaration, Node, type SourceFile, ts} from "ts-morph"
import type * as declared from "ts-refine"
import type {TSR} from "ts-refine"
import {inspectorNames} from "../common/inspector-names.ts"
import {resolveProject} from "../lib/init-project.ts"
import {displayPath, selectSourceFiles} from "../lib/source-files.ts"

export const refineInspect: typeof declared.refineInspect = async (opts) => {
    const {paths, inspectorNames: requested, log} = opts
    const project = resolveProject(opts)

    for (const name of requested) {
        if (!(inspectorNames as readonly string[]).includes(name)) {
            throw new Error(`unknown inspector name: ${name} (known: ${inspectorNames.join(", ")})`)
        }
    }

    const targets = selectSourceFiles(project, {paths})

    // Importers analysis scans every other project source file for import
    // declarations / `export ... from` / dynamic imports pointing here, so
    // build the candidate set once and reuse across targets. External
    // declarations (TS lib, @types/*) are not project files, so drop them.
    const allFiles = requested.includes("importers") ? project.getSourceFiles().filter((sf) => !sf.isFromExternalLibrary()) : []

    const results: TSR.InspectFile[] = []
    for (const sf of targets) {
        const entry: TSR.InspectFile = {file: displayPath(sf.getFilePath())}
        if (requested.includes("exports")) entry.exports = gatherExports(sf)
        if (requested.includes("importers")) entry.importers = gatherImporters(sf, allFiles)
        results.push(entry)
    }

    results.sort((a, b) => a.file.localeCompare(b.file))
    log.write(`inspect: ${results.length} files\n`)
    return results
}

// Per-file: one row per other source file that brings symbols / a
// side-effect / a re-export / a dynamic import from this one. `kinds` and
// `names` collapse multiple statements in the same importer into one row.
function gatherImporters(target: SourceFile, allFiles: SourceFile[]): TSR.InspectImporter[] {
    const out: TSR.InspectImporter[] = []

    for (const sf of allFiles) {
        if (sf === target) continue
        const kinds = new Set<string>()
        const names = new Set<string>()

        for (const decl of sf.getImportDeclarations()) {
            if (decl.getModuleSpecifierSourceFile() !== target) continue
            recordImport(decl, kinds, names)
        }
        for (const decl of sf.getExportDeclarations()) {
            if (decl.getModuleSpecifierSourceFile() !== target) continue
            kinds.add("re-export")
            const namespaceExport = decl.getNamespaceExport()
            if (namespaceExport) names.add(`* as ${namespaceExport.getName()}`)
            const named = decl.getNamedExports()
            if (named.length > 0) for (const n of named) names.add(n.getName())
            // `export * from "..."` has neither — fall through with no names.
            if (!namespaceExport && named.length === 0) names.add("*")
        }
        for (const call of sf.getDescendantsOfKind(ts.SyntaxKind.CallExpression)) {
            if (call.getExpression().getKindName() !== "ImportKeyword") continue
            const arg = call.getArguments()[0]
            if (!arg || !Node.isStringLiteral(arg)) continue
            if (resolveModuleSpecifier(sf, arg.getLiteralValue()) !== target) continue
            kinds.add("dynamic")
            names.add("(dynamic)")
        }

        if (kinds.size === 0) continue
        out.push({
            file: displayPath(sf.getFilePath()),
            kinds: [...kinds].sort((a, b) => a.localeCompare(b)),
            names: [...names].sort((a, b) => a.localeCompare(b)),
        })
    }

    out.sort((a, b) => a.file.localeCompare(b.file))
    return out
}

// Classifies an import declaration into one or more kinds and collects
// the names it brings in. `value` is the catch-all for "at least one
// value name imported" (matching the TS value/type terminology pair).
function recordImport(decl: ImportDeclaration, kinds: Set<string>, names: Set<string>): void {
    if (decl.isTypeOnly()) {
        kinds.add("type")
        for (const n of decl.getNamedImports()) names.add(n.getName())
        return
    }
    const namespaceImport = decl.getNamespaceImport()
    if (namespaceImport) {
        kinds.add("namespace")
        names.add(`* as ${namespaceImport.getText()}`)
        return
    }
    const namedImports = decl.getNamedImports()
    const defaultImport = decl.getDefaultImport()
    if (namedImports.length === 0 && !defaultImport) {
        // Bare `import "./x.ts"` — neither namespace, named, nor default.
        kinds.add("side-effect")
        names.add("(side effect)")
        return
    }
    kinds.add("value")
    if (defaultImport) names.add(`default as ${defaultImport.getText()}`)
    for (const n of namedImports) names.add(n.isTypeOnly() ? `type ${n.getName()}` : n.getName())
}

// Resolves a dynamic import string literal to the project SourceFile it
// points at. Relative specifiers are resolved against the importer's
// directory; `.ts` is appended when the specifier has no extension (the
// project's `.ts`-explicit convention isn't universal in dynamic call
// sites). Non-project / unresolved specifiers return undefined.
function resolveModuleSpecifier(from: SourceFile, specifier: string): SourceFile | undefined {
    if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return undefined
    const project = from.getProject()
    const baseDir = from.getDirectoryPath()
    const absolute = path.isAbsolute(specifier) ? specifier : path.resolve(baseDir, specifier)
    return project.getSourceFile(absolute) ?? project.getSourceFile(absolute + ".ts")
}

// Per-file: one row per exported declaration originating in the file
// (re-export passthrough is skipped to avoid double counting). `importers`
// counts distinct external source files using this export; `example` is
// the alphabetically first such file, or null when unused.
function gatherExports(sf: SourceFile): TSR.InspectExport[] {
    const out: TSR.InspectExport[] = []

    for (const [name, decls] of sf.getExportedDeclarations()) {
        for (const decl of decls) {
            if (decl.getSourceFile() !== sf) continue
            if (!Node.isReferenceFindable(decl)) continue
            const target = "getNameNode" in decl && typeof (decl as any).getNameNode === "function" ? ((decl as any).getNameNode() ?? decl) : decl
            if (!Node.isReferenceFindable(target)) continue

            const declStart = target.getStart()
            const externalFiles = new Set<string>()
            for (const ref of target.findReferencesAsNodes()) {
                const refSf = ref.getSourceFile()
                if (refSf === sf && ref.getStart() === declStart) continue
                if (refSf !== sf) externalFiles.add(displayPath(refSf.getFilePath()))
            }

            const sortedImporters = [...externalFiles].sort((a, b) => a.localeCompare(b))
            const {line} = sf.getLineAndColumnAtPos(decl.getStart())
            out.push({
                line,
                kind: kindLabel(decl),
                name,
                importers: sortedImporters.length,
                example: sortedImporters[0] ?? null,
            })
        }
    }

    out.sort((a, b) => a.line - b.line)
    return out
}

// Map a declaration node to a human-friendly kind label
// (function/class/const/...) instead of ts-morph's raw kind name.
function kindLabel(decl: Node): string {
    if (Node.isFunctionDeclaration(decl)) return "function"
    if (Node.isClassDeclaration(decl)) return "class"
    if (Node.isInterfaceDeclaration(decl)) return "interface"
    if (Node.isTypeAliasDeclaration(decl)) return "type"
    if (Node.isEnumDeclaration(decl)) return "enum"
    if (Node.isModuleDeclaration(decl)) return "namespace"
    if (Node.isVariableDeclaration(decl)) {
        const stmt = decl.getVariableStatement()
        if (stmt) return String(stmt.getDeclarationKind())
        return "var"
    }
    return decl.getKindName()
}

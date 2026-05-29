// report unused-exports: list exports that have no external references.
// Walks getExportedDeclarations() and reverse-checks via findReferencesAsNodes.
// Emits a Markdown table prefixed with `### unused-exports`.
// barrel re-exports (`export * from`) are treated as references (passthrough).

import type {Project} from "ts-morph"
import {Node} from "ts-morph"

import {displayPath, selectSourceFiles} from "../lib/source-files.ts"
import type {ReportOpts} from "./types.ts"

export async function runReportUnusedExports(project: Project, {stream, paths}: ReportOpts): Promise<void> {
    // Skip .d.ts: type declaration files are external-consumption surfaces by definition.
    const sourceFiles = selectSourceFiles(project, {paths}).filter((sf) => !sf.getFilePath().endsWith(".d.ts"))

    const findings: {file: string; line: number; name: string; kind: string; suggestion: string}[] = []
    let totalExports = 0

    for (const sf of sourceFiles) {
        const exported = sf.getExportedDeclarations()
        for (const [name, decls] of exported) {
            for (const decl of decls) {
                // Skip declarations that live in another file (re-export passthrough)
                // to avoid double counting and out-of-range getLineAndColumnAtPos.
                if (decl.getSourceFile() !== sf) continue

                totalExports++
                if (!Node.isReferenceFindable(decl)) continue

                // Use the name node when available; some declarations are findable but
                // produce more reliable results when queried via their identifier.
                const target = "getNameNode" in decl && typeof (decl as any).getNameNode === "function" ? ((decl as any).getNameNode() ?? decl) : decl
                if (!Node.isReferenceFindable(target)) continue

                const refs = target.findReferencesAsNodes()
                const declStart = target.getStart()
                let inFileRefs = 0
                let externalRefs = 0
                for (const ref of refs) {
                    const refSf = ref.getSourceFile()
                    if (refSf === sf && ref.getStart() === declStart) continue
                    if (refSf === sf) inFileRefs++
                    else externalRefs++
                }
                if (externalRefs > 0) continue

                const {line} = sf.getLineAndColumnAtPos(decl.getStart())
                findings.push({
                    file: displayPath(sf.getFilePath()),
                    line,
                    name,
                    kind: kindLabel(decl),
                    suggestion: inFileRefs > 0 ? "unexport" : "delete",
                })
            }
        }
    }

    findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

    stream.write("### unused-exports\n")
    stream.write("\n")
    stream.write("| file | line | name | kind | suggestion |\n")
    stream.write("| --- | --- | --- | --- | --- |\n")
    for (const f of findings) {
        stream.write(`| ${f.file} | ${f.line} | ${f.name} | ${f.kind} | ${f.suggestion} |\n`)
    }
    stream.write("\n")
    console.error(`report unused-exports: ${findings.length} findings / ${totalExports} exports / ${sourceFiles.length} files`)
}

// Map declaration node to a human-friendly kind label (function/class/const/...)
// instead of ts-morph's raw kind name. Variable declarations report the
// declaration keyword (const/let/var) for context.
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

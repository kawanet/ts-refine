// Barrel surface: the compat layer must re-export the ts-morph names the
// library imports. Per-module behavior is covered by the colocated
// node / source-file / project / symbol test files.

import assert from "node:assert/strict"
import {test} from "node:test"
import * as bridge from "./bridge.ts"

test("re-exports the ts-morph-compatible value surface", () => {
    const names = [
        "Project",
        "SourceFile",
        "Symbol",
        "Node",
        "Identifier",
        "StringLiteral",
        "ImportDeclaration",
        "ExportDeclaration",
        "ClassDeclaration",
        "InterfaceDeclaration",
    ]
    for (const name of names) {
        assert.equal(typeof (bridge as Record<string, unknown>)[name], "function", `missing export: ${name}`)
    }
})

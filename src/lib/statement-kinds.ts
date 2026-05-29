// ASI-eligible statement kinds: statements whose trailing semicolon is
// optional under Automatic Semicolon Insertion. Used by the semicolons
// report to count the same statements the LS rewrites.

import {Node} from "ts-morph"

export function isSemiEligibleStatement(node: Node): boolean {
    return (
        Node.isExpressionStatement(node) ||
        Node.isVariableStatement(node) ||
        Node.isImportDeclaration(node) ||
        Node.isImportEqualsDeclaration(node) ||
        Node.isExportDeclaration(node) ||
        Node.isExportAssignment(node) ||
        Node.isTypeAliasDeclaration(node) ||
        Node.isReturnStatement(node) ||
        Node.isThrowStatement(node) ||
        Node.isBreakStatement(node) ||
        Node.isContinueStatement(node) ||
        Node.isDebuggerStatement(node)
    )
}

// Interface / type-literal members. The LS SemicolonPreference rewrites
// their none↔`;` separator just like statements, so the report counts
// them too. Comma-separated members are excluded by the caller (the LS
// leaves them untouched), keeping the count domain == the apply domain.
export function isTypeMember(node: Node): boolean {
    return (
        Node.isPropertySignature(node) ||
        Node.isMethodSignature(node) ||
        Node.isIndexSignatureDeclaration(node) ||
        Node.isCallSignatureDeclaration(node) ||
        Node.isConstructSignatureDeclaration(node)
    )
}

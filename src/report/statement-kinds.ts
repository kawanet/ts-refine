// ASI-eligible statement kinds: statements whose trailing semicolon is
// optional under Automatic Semicolon Insertion. Used by the semi report to
// count the same statements the LS rewrites. Expressed as a SyntaxKind set so
// the report can test a raw compiler node's kind without allocating a wrapper.

import {SyntaxKind} from "typescript"

export const SEMI_ELIGIBLE_STATEMENT_KINDS: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.ExpressionStatement,
    SyntaxKind.VariableStatement,
    SyntaxKind.ImportDeclaration,
    SyntaxKind.ImportEqualsDeclaration,
    SyntaxKind.ExportDeclaration,
    SyntaxKind.ExportAssignment,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.ReturnStatement,
    SyntaxKind.ThrowStatement,
    SyntaxKind.BreakStatement,
    SyntaxKind.ContinueStatement,
    SyntaxKind.DebuggerStatement,
])

// Interface / type-literal members. The LS SemicolonPreference rewrites their
// none↔`;` separator just like statements, so the report counts them too.
// Comma-separated members are excluded by the caller (the LS leaves them
// untouched), keeping the count domain == the apply domain.
export const TYPE_MEMBER_KINDS: ReadonlySet<SyntaxKind> = new Set([
    SyntaxKind.PropertySignature,
    SyntaxKind.MethodSignature,
    SyntaxKind.IndexSignature,
    SyntaxKind.CallSignature,
    SyntaxKind.ConstructSignature,
])

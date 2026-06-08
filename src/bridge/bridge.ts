// Public surface of the ts-morph compatibility layer. The library imports the
// ts-morph names it uses from here; values native to TypeScript (SyntaxKind,
// ScriptKind, SemicolonPreference, …) are imported straight from "typescript"
// at their use sites instead. Names match ts-morph so call sites are unchanged.

export type {FormatCodeSettings} from "typescript"
export {
    CallExpression,
    ClassDeclaration,
    EnumDeclaration,
    ExportDeclaration,
    ExportSpecifier,
    FunctionDeclaration,
    Identifier,
    ImportClause,
    ImportDeclaration,
    ImportSpecifier,
    InterfaceDeclaration,
    ModuleDeclaration,
    NamedImports,
    NamespaceExport,
    NamespaceImport,
    Node,
    StringLiteral,
    TypeAliasDeclaration,
    VariableDeclaration,
    VariableStatement,
} from "./node.ts"
export type {ClassMemberTypes, TypeElementTypes} from "./node.ts"
export {Project} from "./project.ts"
export type {ProjectOptions} from "./project.ts"
export {SourceFile} from "./source-file.ts"
export {Symbol} from "./symbol.ts"

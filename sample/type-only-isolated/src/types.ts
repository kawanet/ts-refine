// A type and a value re-exported together below; isolatedModules alone (no
// verbatimModuleSyntax) drives only the export-side fix.
export type Shape = {kind: string};
export const VERSION = 1;

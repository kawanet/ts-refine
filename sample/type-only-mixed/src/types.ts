// A type, a value, and a default export so the consumers below mix type-only
// and value references — the input the type-only fixes are meant to rewrite.
export type Shape = {kind: string};
export const VERSION = 1;
export default class Registry {}

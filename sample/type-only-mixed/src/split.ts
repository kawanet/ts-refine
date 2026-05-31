// `import type` with both a default and named bindings is illegal TypeScript;
// splitTypeOnlyImport rescues it into two declarations.
import type Registry, {Shape} from "./types.js";
let r: Registry | undefined;
const s: Shape = {kind: "x"};
console.log(r, s);

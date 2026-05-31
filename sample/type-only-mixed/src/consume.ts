// Shape is referenced only as a type while VERSION is a value, so under
// verbatimModuleSyntax convertToTypeOnlyImport marks Shape inline.
import {Shape, VERSION} from "./types.js";
const s: Shape = {kind: "circle"};
console.log(s, VERSION);

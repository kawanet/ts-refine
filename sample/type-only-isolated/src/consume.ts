// Shape is used only as a type, but convertToTypeOnlyImport needs
// verbatimModuleSyntax, so under isolatedModules alone this import is left
// untouched — only the export side is rewritten.
import {Shape, VERSION} from "./types.js";
const s: Shape = {kind: "square"};
console.log(s, VERSION);

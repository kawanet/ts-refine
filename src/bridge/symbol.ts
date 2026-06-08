// Symbol wrapper over the type checker. Target resolution walks dotted specs
// through these (a namespace export and a type member resolve the same way), so
// the surface is just what that walk needs: name, alias resolution, export /
// member lookup, and the declarations a symbol carries.

import ts from "typescript"
import type {Node} from "./node.ts"
import type {Project} from "./project.ts"

export class Symbol {
    private readonly project: Project
    private readonly symbol: ts.Symbol

    constructor(project: Project, symbol: ts.Symbol) {
        this.project = project
        this.symbol = symbol
    }

    getName(): string {
        return this.symbol.getName()
    }

    // Concise inspector so util.inspect does not expand the checker graph.
    [globalThis.Symbol.for("nodejs.util.inspect.custom")](): string {
        return `Symbol<${this.symbol.getName()}>`
    }

    // The symbol an import/alias points at, or undefined when this is not an
    // alias — callers fall back to the symbol itself.
    getAliasedSymbol(): Symbol | undefined {
        if ((this.symbol.flags & ts.SymbolFlags.Alias) === 0) return undefined
        const aliased = this.project.getTypeChecker().getAliasedSymbol(this.symbol)
        return aliased != null ? this.project.wrapSymbol(aliased) : undefined
    }

    // A named module/namespace export of this symbol.
    getExport(name: string): Symbol | undefined {
        return this.lookup(this.symbol.exports, name)
    }

    // A named type member (interface / type-literal member) of this symbol.
    getMember(name: string): Symbol | undefined {
        return this.lookup(this.symbol.members, name)
    }

    getDeclarations(): Node[] {
        const decls = this.symbol.getDeclarations() ?? []
        return decls.map((d) => this.project.wrapProgramNode(d))
    }

    private lookup(table: ts.SymbolTable | undefined, name: string): Symbol | undefined {
        const found = table?.get(ts.escapeLeadingUnderscores(name))
        return found != null ? this.project.wrapSymbol(found) : undefined
    }
}

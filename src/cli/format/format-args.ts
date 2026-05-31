// `format`: a fixed set of override options plus positional files. Globals
// (-p / --dry-run) that land among them are consumed into `common`.

import type {FormatOptions} from "../../recommend/format-options.ts"
import {type CommonArgs, parseCommonArgs} from "../args-common.ts"

// Raw values only: the runner resolves `paths` into absolute paths.
export interface FormatArgs {
    paths: string[]
    applyOverrides: FormatOptions
}

export function parseFormat(sub: string[], common: CommonArgs): FormatArgs | undefined {
    const overrides: FormatOptions = {}
    const paths: string[] = []
    let i = 0

    while (i < sub.length) {
        const a = sub[i]
        if (a === "--organize-imports") {
            const v = sub[i + 1]
            if (v !== "on" && v !== "off") {
                console.error(`--organize-imports expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.organizeImports = v
            i += 2
        } else if (a === "--semicolons") {
            const v = sub[i + 1]
            if (v !== "on" && v !== "off") {
                console.error(`--semicolons expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.semicolons = v
            i += 2
        } else if (a === "--indent") {
            const v = sub[i + 1]
            if (!v || v.startsWith("-")) {
                console.error("--indent requires a positive integer or 'tab' (e.g. --indent 4)")
                return undefined
            }
            // "tab" maps to tab indentation; otherwise a positive integer.
            if (v === "tab") {
                overrides.indent = "tab"
            } else {
                const n = Number(v)
                if (!Number.isInteger(n) || n <= 0) {
                    console.error(`--indent expects a positive integer or 'tab'; got: ${v}`)
                    return undefined
                }
                overrides.indent = n
            }
            i += 2
        } else if (a === "--new-line") {
            // `cr` rejected: LS formatter accepts \n / \r\n only.
            const v = sub[i + 1]
            if (v !== "lf" && v !== "crlf") {
                console.error(`--new-line expects 'lf' or 'crlf'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.newLine = v
            i += 2
        } else if (a === "--bracket-spacing") {
            const v = sub[i + 1]
            if (v !== "on" && v !== "off") {
                console.error(`--bracket-spacing expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
                return undefined
            }
            overrides.bracketSpacing = v
            i += 2
        } else {
            const consumed = parseCommonArgs(common, sub, i)
            if (consumed < 0) return undefined
            if (consumed > 0) {
                i += consumed
            } else if (a.startsWith("-")) {
                console.error(`unknown option: ${a}`)
                return undefined
            } else {
                paths.push(a)
                i++
            }
        }
    }

    return {paths, applyOverrides: overrides}
}

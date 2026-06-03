// `format`: a fixed set of override options plus positional files. Globals
// (-p / --dry-run) that land among them are consumed into `common`.

import type {TSR} from "ts-refine"
import {type CommonArgs, parseCommonArgs} from "../parse-common-args.ts"

// Raw values only: the runner resolves `paths` into absolute paths and decides
// what `check` implies (dry-run plus a non-zero exit when anything would change).
export interface FormatArgs {
    paths: string[]
    applyOverrides: TSR.FormatStyle
    check: boolean
}

export function parseFormatArgs(sub: string[], common: CommonArgs): FormatArgs | undefined {
    const overrides: TSR.FormatStyle = {}
    const paths: string[] = []
    let check = false
    let i = 0

    while (i < sub.length) {
        const consumed = parseCommonArgs(common, sub, i)
        if (consumed > 0) {
            i += consumed
            continue
        }

        const a = sub[i]
        if (a === "--organize-imports") {
            // Removed: organizing imports is now its own command. Named back
            // explicitly so existing scripts get a redirect, not "unknown option".
            throw new Error("--organize-imports was removed; use `ts-refine imports` instead")
        } else if (a === "--semicolons") {
            const v = sub[i + 1]
            if (v !== "on" && v !== "off") {
                throw new Error(`--semicolons expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
            }
            overrides.semicolons = v
            i += 2
        } else if (a === "--indent") {
            const v = sub[i + 1]
            if (!v || v.startsWith("-")) {
                throw new Error("--indent requires a positive integer or 'tab' (e.g. --indent 4)")
            }

            // "tab" maps to tab indentation; otherwise a positive integer.
            if (v === "tab") {
                overrides.indent = "tab"
            } else {
                const n = Number(v)
                if (!Number.isInteger(n) || n <= 0) {
                    throw new Error(`--indent expects a positive integer or 'tab'; got: ${v}`)
                }
                overrides.indent = n
            }
            i += 2
        } else if (a === "--new-line") {
            // `cr` rejected: LS formatter accepts \n / \r\n only.
            const v = sub[i + 1]
            if (v !== "lf" && v !== "crlf") {
                throw new Error(`--new-line expects 'lf' or 'crlf'; got: ${v ?? "(missing)"}`)
            }
            overrides.newLine = v
            i += 2
        } else if (a === "--bracket-spacing") {
            const v = sub[i + 1]
            if (v !== "on" && v !== "off") {
                throw new Error(`--bracket-spacing expects 'on' or 'off'; got: ${v ?? "(missing)"}`)
            }
            overrides.bracketSpacing = v
            i += 2
        } else if (a === "--check") {
            check = true
            i++
        } else if (a.startsWith("-")) {
            throw new Error(`unknown option: ${a}`)
        } else {
            paths.push(a)
            i++
        }
    }

    return {paths, applyOverrides: overrides, check}
}

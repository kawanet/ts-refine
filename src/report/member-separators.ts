// report member-separators: classify each interface / class member by
// its trailing punctuation (`;`, `,`, or none / newline-only), then bucket
// files by the primary style they use. Body-bearing members (methods,
// accessors, constructors) are skipped because the separator choice isn't
// theirs to make.
//
// The recommendation drives the `format` command's memberSeparators apply
// pass (src/format/apply-member-separators.ts). It still has no Prettier
// mapping (comma members are unreachable there), so the .prettierrc emitter
// omits it.

import type {ClassMemberTypes, TypeElementTypes} from "ts-morph"
import {Node} from "ts-morph"
import type {TSR} from "ts-refine"
import {logging} from "../common/logging.ts"
import {displayPath} from "../lib/source-files.ts"
import {pickRecommendByFiles} from "./pick-recommend.ts"
import type {ReportRunOpts} from "./types.ts"

type Separator = "none" | "," | ";"

// Display order is fixed (none / , / ;) so the table layout is stable
// regardless of which buckets happen to be populated.
const DISPLAY_ORDER: Separator[] = ["none", ",", ";"]

const SEP_LABEL: Record<Separator, string> = {
    none: "`\\n`",
    ",": "`,`",
    ";": "`;`",
}

// Maps internal Separator symbols to MemberSeparatorsOpts.separator's
// value space (semi / comma / none).
const SEP_FLAG_VALUE: Record<Separator, TSR.MemberSeparatorsOpts["separator"]> = {
    none: "none",
    ",": "comma",
    ";": "semi",
}

type Bucket = {lines: number; files: number; topPath: string; topLines: number}

export async function runReportMemberSeparators({sourceFiles, output, log, importsOnly}: ReportRunOpts): Promise<Partial<TSR.MemberSeparatorsOpts>> {
    // import/export statements carry no interface/class members, so an
    // imports-only survey has nothing to weigh — skip the whole-file scan.
    if (importsOnly) return {}

    type PerFile = {path: string; counts: Map<Separator, number>; primary: Separator}
    const perFile: PerFile[] = []

    for (const sf of sourceFiles) {
        const counts = new Map<Separator, number>()
        sf.forEachDescendant((node) => {
            if (!Node.isInterfaceDeclaration(node) && !Node.isClassDeclaration(node)) return
            for (const member of node.getMembers()) {
                const kind = classify(member)
                if (kind === null) continue
                counts.set(kind, (counts.get(kind) ?? 0) + 1)
            }
        })
        if (counts.size === 0) continue
        perFile.push({path: displayPath(sf.getFilePath()), counts, primary: pickPrimary(counts)})
    }

    const buckets = new Map<Separator, Bucket>()
    for (const f of perFile) {
        const linesAtPrimary = f.counts.get(f.primary) ?? 0
        let b = buckets.get(f.primary)
        if (!b) {
            b = {lines: 0, files: 0, topPath: f.path, topLines: 0}
            buckets.set(f.primary, b)
        }
        b.lines += linesAtPrimary
        b.files++
        if (linesAtPrimary > b.topLines || (linesAtPrimary === b.topLines && f.path.localeCompare(b.topPath) < 0)) {
            b.topPath = f.path
            b.topLines = linesAtPrimary
        }
    }

    // Recommendation: file-count majority, line count breaks ties.
    const recommendSep = pickRecommendByFiles(DISPLAY_ORDER, (s) => buckets.get(s))

    // The Markdown table is for display only; skip it (and its formatting)
    // when no output sink is given — the recommendation above is the result.
    if (output) {
        const totalLines = [...buckets.values()].reduce((s, b) => s + b.lines, 0)

        output.write("### member-separators\n")
        output.write("\n")
        output.write("| separator | lines | files | example |\n")
        output.write("| --- | --- | --- | --- |\n")
        for (const s of DISPLAY_ORDER) {
            const b = buckets.get(s)

            // `\n` and `;` always get a row (0 when absent); `,` only appears
            // when present, since a comma style is unusual enough to be noise
            // as a permanent 0-row.
            if (b) {
                output.write(`| ${SEP_LABEL[s]} | ${b.lines} | ${b.files} | ${b.topPath} |\n`)
            } else if (s !== ",") {
                output.write(`| ${SEP_LABEL[s]} | 0 | 0 |  |\n`)
            }
        }
        output.write(`| total | ${totalLines} | ${perFile.length} |  |\n`)
        output.write("\n")
    }
    logging(log, `report member-separators: ${perFile.length} files counted / ${sourceFiles.length} files total`)

    // The recommendation is rendered in the trailing `## recommendation`
    // section, so all we return is the action params shape. An ambiguous
    // file-count majority (no strict winner) returns an empty partial.
    return recommendSep !== undefined ? {separator: SEP_FLAG_VALUE[recommendSep]} : {}
}

// A member "owns" a trailing separator only when it isn't body-bearing: a
// method / accessor / constructor / static block ends in its own `}`, not a
// separator. Property / index / call / construct signatures and class fields
// do. Shared with the apply pass so report and format agree on the scope.
export function isSeparableMember(member: ClassMemberTypes | TypeElementTypes): boolean {
    if (Node.isClassStaticBlockDeclaration(member)) return false
    return memberBody(member) === undefined
}

// Reads the member AST and returns the trailing separator. Only members with
// their own executable body are skipped; properties whose initializer ends in
// `}` still have a trailing punctuation style to count.
function classify(member: ClassMemberTypes | TypeElementTypes): Separator | null {
    if (!isSeparableMember(member)) return null
    const last = member.getText().trimEnd().slice(-1)
    if (last === ";") return ";"
    if (last === ",") return ","
    return "none"
}

function memberBody(member: ClassMemberTypes | TypeElementTypes): unknown {
    return "getBody" in member ? member.getBody() : undefined
}

// Primary = bucket with the highest count in this file. Ties follow the
// display order (none > , > ;) so the report stays deterministic — the
// "lowest-ceremony" style wins a tie.
function pickPrimary(counts: Map<Separator, number>): Separator {
    let best: Separator = "none"
    let bestCount = -1
    for (const s of DISPLAY_ORDER) {
        const c = counts.get(s) ?? 0
        if (c > bestCount) {
            bestCount = c
            best = s
        }
    }
    return best
}

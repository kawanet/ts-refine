// Records the indent "step" each line introduces relative to its
// predecessor, rather than the absolute leading width. The motivation
// is that a deeply nested 4-space file would otherwise be dominated by
// the 8-space (level 2) lines that outnumber the 4-space (level 1)
// ones — making the file look like an "8-space" file when it isn't.
// A relative diff records the step itself, so any block transition
// (0→4, 4→8, 8→4, etc.) contributes the same key 4.
//
// Keys:
//   - "tab"   when the current line starts with a tab.
//   - <number> when both the current and the previous line are
//             space-leading (or column 0) and the diff is > 0.
// Skipped lines (blank lines, JSDoc / block-comment continuation
// lines whose first non-space character is `*`) leave the "previous
// line" state untouched, so a comment block doesn't introduce a
// spurious diff against the code on either side of it. The first
// recorded line just sets the baseline; it contributes no key.
//
// A `primaryIndentWidth` helper picks the most-frequent key out of the
// resulting map for callers (the report aggregator, the action's
// rewrite unit).

export type IndentWidth = "tab" | number
export type IndentCounts = Map<IndentWidth, number>

export function detectIndent(text: string): IndentCounts {
    const counts: IndentCounts = new Map()
    let prevIndent = 0
    let prevHasTab = false
    let prevValid = false

    for (const line of text.split("\n")) {
        if (line.length === 0) continue

        // Detect leading whitespace shape.
        const first = line[0]
        const currentHasTab = first === "\t"
        let currentIndent = 0
        if (first === " ") {
            while (currentIndent < line.length && line[currentIndent] === " ") currentIndent++
            if (currentIndent === line.length) continue // all-whitespace line
            if (line[currentIndent] === "*") continue // ` * ...` block-comment continuation
        }

        // Lines whose first non-space token is `*` were caught above; here
        // we still need to guard tab-leading "weird" cases, but tab itself
        // is the value we want to count.
        if (currentHasTab) {
            counts.set("tab", (counts.get("tab") ?? 0) + 1)
            prevIndent = currentIndent
            prevHasTab = currentHasTab
            prevValid = true
            continue
        }

        if (prevValid && !prevHasTab) {
            const diff = Math.abs(currentIndent - prevIndent)
            if (diff > 0) counts.set(diff, (counts.get(diff) ?? 0) + 1)
        }

        prevIndent = currentIndent
        prevHasTab = false
        prevValid = true
    }

    return counts
}

// Returns the most-frequent key in the counts map. Ties prefer the
// smaller numeric width (so a balanced file is reported under its
// first-level indent), and numeric beats "tab" when those tie (a mixed
// file is more often a space-indented file with stray tab lines than
// the other way around). Returns undefined only when the map is empty.
export function primaryIndentWidth(counts: IndentCounts): IndentWidth | undefined {
    let best: IndentWidth | undefined
    let bestCount = 0
    for (const [k, v] of counts) {
        if (v > bestCount) {
            bestCount = v
            best = k
            continue
        }
        if (v !== bestCount) continue
        if (best == null) {
            best = k
            continue
        }
        if (typeof k === "number" && typeof best === "number" && k < best) best = k
        else if (typeof k === "number" && best === "tab") best = k
    }
    return best
}

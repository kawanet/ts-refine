// Whether the range [from, to) of `text` contains any line break. Used by hot
// passes that only need to know if a node spans multiple lines, without
// allocating its text or routing through wrapper line-number APIs.
//
// Only LF is scanned. CRLF still contains LF, and pure CR-only sources are not
// a target. Native indexOf is fast enough that the worst case (no LF after
// `from`) scanning to EOF is negligible on realistic source files.
export function hasLineBreakBetween(text: string, from: number, to: number): boolean {
    if (from >= to) return false
    const lf = text.indexOf("\n", from)
    return lf >= 0 && lf < to
}

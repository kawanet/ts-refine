// Shared statistics and table rendering for the benchmark. Kept separate so the
// report and format sections format their results identically.

import type {TSR} from "ts-refine"

export interface Summary {
    total: number
    min: number
    median: number
    mean: number
    max: number
}

// Median uses the average of the two central samples for an even count so a
// single slow run does not dominate the headline figure.
export function summarize(samples: number[]): Summary {
    // An empty set has no median/mean to report; fail loudly rather than
    // returning NaN that would surface as a confusing "NaNms" table cell.
    if (samples.length === 0) throw new Error("summarize: needs at least one sample")

    const sorted = [...samples].sort((a, b) => a - b)
    const total = samples.reduce((sum, n) => sum + n, 0)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]

    return {total, min: sorted[0], median, mean: total / samples.length, max: sorted[sorted.length - 1]}
}

export function formatMs(value: number): string {
    return `${value.toFixed(2)}ms`
}

export interface StatRow extends Summary {
    name: string
    runs: number
}

// Single renderer for both the report and format sections so their columns
// never drift apart. Only the first column's header differs; rows are sorted
// slowest-first by mean.
export function printStatsTable(output: TSR.Writer, nameHeader: string, rows: StatRow[]): void {
    const sorted = [...rows].sort((a, b) => b.mean - a.mean)
    printTable(
        output,
        [nameHeader, "runs", "total", "mean", "median", "min", "max"],
        sorted.map((row) => [row.name, String(row.runs), formatMs(row.total), formatMs(row.mean), formatMs(row.median), formatMs(row.min), formatMs(row.max)]),
    )
}

// Render a left-aligned column table to the writer, sizing each column to its
// widest cell so the report and format tables line up the same way.
function printTable(output: TSR.Writer, headers: string[], rows: string[][]): void {
    const widths = headers.map((header, i) => Math.max(header.length, ...rows.map((row) => row[i].length)))

    output.write(headers.map((header, i) => header.padEnd(widths[i])).join("  ") + "\n")
    output.write(widths.map((width) => "-".repeat(width)).join("  ") + "\n")
    for (const row of rows) {
        output.write(row.map((cell, i) => cell.padEnd(widths[i])).join("  ") + "\n")
    }
}

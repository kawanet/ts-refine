// Bucket-based reports all decide by file-count majority. Ties are
// broken by the occurrence count at the primary (the `lines` field),
// and a tie at both falls back to undefined.

type RecommendBucket = {files: number; lines: number}

export function pickRecommendByFiles<K>(keys: readonly K[], get: (k: K) => RecommendBucket | undefined): K | undefined {
    let recommend: K | undefined
    let bestFiles = 0
    let bestLines = 0
    for (const k of keys) {
        const b = get(k)
        if (!b) continue
        if (b.files > bestFiles || (b.files === bestFiles && b.lines > bestLines)) {
            bestFiles = b.files
            bestLines = b.lines
            recommend = k
        } else if (b.files === bestFiles && b.lines === bestLines && recommend !== k) {
            recommend = undefined
        }
    }
    return recommend
}

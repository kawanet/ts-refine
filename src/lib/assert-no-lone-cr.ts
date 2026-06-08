// CR-only files (a lone `\r` with no `\n`) are unsupported: the TS language
// service formatter cannot emit them and they do not occur in practice. CRLF
// still passes because `\r\n` contains `\n`.
export function assertNoLoneCr(text: string, path: string): void {
    if (!/\n/.test(text) && /\r/.test(text)) {
        throw new Error(`CR-only line endings are not supported: ${path}`)
    }
}

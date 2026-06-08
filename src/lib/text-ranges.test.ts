import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {hasLineBreakBetween} from "./text-ranges.ts"

describe("hasLineBreakBetween", () => {
    it("detects LF inside the requested range", () => {
        assert.equal(hasLineBreakBetween("a\nb", 0, 3), true)
        assert.equal(hasLineBreakBetween("a\nb", 0, 2), true)
    })

    it("ignores LF outside the requested range", () => {
        assert.equal(hasLineBreakBetween("a\nb", 0, 1), false)
        assert.equal(hasLineBreakBetween("a\nb", 2, 3), false)
    })

    it("treats CRLF as a line break via LF", () => {
        assert.equal(hasLineBreakBetween("a\r\nb", 0, 4), true)
    })

    it("returns false for empty or reversed ranges", () => {
        assert.equal(hasLineBreakBetween("a\nb", 1, 1), false)
        assert.equal(hasLineBreakBetween("a\nb", 2, 1), false)
    })
})

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {pickRecommendByFiles} from "./pick-recommend.ts"

describe("pickRecommendByFiles", () => {
    it("returns the key with the strictly larger file count", () => {
        const m = new Map([
            ["a", {files: 3, lines: 5}],
            ["b", {files: 2, lines: 9}],
        ])
        assert.equal(
            pickRecommendByFiles(["a", "b"], (k) => m.get(k)),
            "a",
        )
    })

    it("breaks a file-count tie by the larger line count", () => {
        const m = new Map([
            ["a", {files: 3, lines: 5}],
            ["b", {files: 3, lines: 9}],
        ])
        assert.equal(
            pickRecommendByFiles(["a", "b"], (k) => m.get(k)),
            "b",
        )
    })

    it("returns undefined when both file and line counts tie across distinct keys", () => {
        const m = new Map([
            ["a", {files: 3, lines: 5}],
            ["b", {files: 3, lines: 5}],
        ])
        assert.equal(
            pickRecommendByFiles(["a", "b"], (k) => m.get(k)),
            undefined,
        )
    })

    it("ignores keys whose getter returns undefined", () => {
        const m = new Map([["a", {files: 2, lines: 4}]])
        assert.equal(
            pickRecommendByFiles(["a", "b"], (k) => m.get(k)),
            "a",
        )
    })

    it("returns undefined when no key has any data", () => {
        assert.equal(
            pickRecommendByFiles(["a", "b"], () => undefined),
            undefined,
        )
    })

    it("a later strictly-bigger entry wins even after a prior tie cleared the recommend", () => {
        const m = new Map([
            ["a", {files: 2, lines: 5}],
            ["b", {files: 2, lines: 5}],
            ["c", {files: 3, lines: 1}],
        ])
        assert.equal(
            pickRecommendByFiles(["a", "b", "c"], (k) => m.get(k)),
            "c",
        )
    })
})

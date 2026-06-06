import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {getTsRefineFormat} from "./emit-ts-refine.ts"

describe("getTsRefineFormat", () => {
    it("maps semi.semi=off → --semi off", () => {
        assert.equal(getTsRefineFormat({semi: {semi: "off"}}), "--semi off")
    })

    it("maps semi.semi=on → --semi on", () => {
        assert.equal(getTsRefineFormat({semi: {semi: "on"}}), "--semi on")
    })

    it("maps indent.width → --indent N", () => {
        assert.equal(getTsRefineFormat({indent: {width: 4}}), "--indent 4")
    })

    it("maps indent.width=tab → --indent tab", () => {
        assert.equal(getTsRefineFormat({indent: {width: "tab"}}), "--indent tab")
    })

    it("maps memberDelimiter.separator → --member-delimiter V (the format command applies it)", () => {
        assert.equal(getTsRefineFormat({memberDelimiter: {delimiter: "none"}}), "--member-delimiter none")
        assert.equal(getTsRefineFormat({memberDelimiter: {delimiter: "comma"}}), "--member-delimiter comma")
    })

    it("maps newLine.newLine → --new-line V", () => {
        assert.equal(getTsRefineFormat({newLine: {newLine: "lf"}}), "--new-line lf")
    })

    it("maps bracketSpacing.bracketSpacing → --bracket-spacing V", () => {
        assert.equal(getTsRefineFormat({bracketSpacing: {bracketSpacing: "on"}}), "--bracket-spacing on")
    })

    it("maps trailingComma.trailingComma → --trailing-comma V", () => {
        assert.equal(getTsRefineFormat({trailingComma: {trailingComma: "on"}}), "--trailing-comma on")
        assert.equal(getTsRefineFormat({trailingComma: {trailingComma: "off"}}), "--trailing-comma off")
    })

    it("combines all recommendations in a fixed order", () => {
        const out = getTsRefineFormat(
            // Input keys are intentionally reversed; the output order is fixed.
            {trailingComma: {trailingComma: "on"}, bracketSpacing: {bracketSpacing: "on"}, newLine: {newLine: "lf"}, memberDelimiter: {delimiter: "none"}, indent: {width: 4}, semi: {semi: "off"}},
        )
        assert.equal(out, "--semi off --indent 4 --member-delimiter none --new-line lf --bracket-spacing on --trailing-comma on")
    })

    it("returns an empty string when nothing was recommended", () => {
        // Symmetric with `--emit prettier` emitting an empty `{}` for the same case.
        assert.equal(getTsRefineFormat({}), "")
    })
})

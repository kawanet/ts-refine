// `--emit stylistic`: render report recommendations as an ESLint flat-config
// JSON object for @stylistic/eslint-plugin. The output is JSON only; callers
// still need to install/register the plugin in their eslint.config.* file.

import type {RuleOptions} from "@stylistic/eslint-plugin"
import type {Linter} from "eslint"
import type {TSR} from "ts-refine"

type StylisticRules = {
    [K in keyof RuleOptions]?: Linter.RuleEntry<RuleOptions[K]>
}

const compactJSON = (value: unknown): string => {
    return JSON.stringify(value, null, 2).replace(/\[.*?]/gs, (match) => {
        // Prettier-like compaction
        return match.replace(/([\[{]?)\n *([\]}]?)/g, (_, open: string, close: string) => open || close || " ")
    })
}

function memberDelimiterConfig(delimiter: TSR.MemberDelimiterReport["delimiter"]): Linter.RuleEntry<RuleOptions["@stylistic/member-delimiter-style"]> {
    return [
        "error",
        {
            multiline: {delimiter, requireLast: true},
            singleline: {delimiter: delimiter === "none" ? "semi" : delimiter, requireLast: delimiter !== "none"},
        },
    ]
}

function semiConfig(report: TSR.ReportResult): Linter.RuleEntry<RuleOptions["@stylistic/semi"]> | undefined {
    const semi = report.semi?.semi
    const delimiter = report.memberDelimiter?.delimiter
    // @stylistic/semi also fixes class fields, while member-delimiter-style
    // only covers interface/type members. Skip semi when the member-delimiter
    // recommendation would make class fields disagree with the semi rule.
    if (semi === "on") {
        if (delimiter === "none" || delimiter === "comma") {
            return undefined
        }
        return ["error", "always"]
    }
    if (semi === "off") {
        if (delimiter === "semi" || delimiter === "comma") {
            return undefined
        }
        return ["error", "never"]
    }
}

function buildStylisticRules(report: TSR.ReportResult): StylisticRules {
    const rules: StylisticRules = {}
    const semi = semiConfig(report)
    if (semi) {
        rules["@stylistic/semi"] = semi
    }
    if (report.indent?.width != null) {
        rules["@stylistic/indent"] = ["error", report.indent.width]
    }
    if (report.memberDelimiter?.delimiter) {
        rules["@stylistic/member-delimiter-style"] = memberDelimiterConfig(report.memberDelimiter.delimiter)
    }
    if (report.newLine?.newLine === "lf") {
        rules["@stylistic/linebreak-style"] = ["error", "unix"]
    } else if (report.newLine?.newLine === "crlf") {
        rules["@stylistic/linebreak-style"] = ["error", "windows"]
    }
    if (report.bracketSpacing?.bracketSpacing === "on") {
        rules["@stylistic/object-curly-spacing"] = ["error", "always"]
    } else if (report.bracketSpacing?.bracketSpacing === "off") {
        rules["@stylistic/object-curly-spacing"] = ["error", "never"]
    }
    if (report.trailingComma?.trailingComma === "on") {
        rules["@stylistic/comma-dangle"] = ["error", "always-multiline"]
    } else if (report.trailingComma?.trailingComma === "off") {
        rules["@stylistic/comma-dangle"] = ["error", "never"]
    }
    return rules
}

export function getStylisticConfig(report: TSR.ReportResult): string {
    const config: Linter.Config = {rules: buildStylisticRules(report)}
    return compactJSON(config)
}

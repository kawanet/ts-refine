import type {RuleOptions} from "@stylistic/eslint-plugin"
import stylistic from "@stylistic/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import type {Linter} from "eslint"

// Rules record typed per rule: keys and each rule's options are checked
// against @stylistic's own option types. RuleOptions carries the options
// only, so it is wrapped in Linter.RuleEntry to add the severity slot.
type StylisticRules = {
    [K in keyof RuleOptions]?: Linter.RuleEntry<RuleOptions[K]>
}

// Each rule mirrors a .prettierrc option. `printWidth` has no equivalent
// because ESLint does not re-wrap long lines. quotes avoidEscape mirrors
// Prettier picking the quote style that minimizes escapes, so strings
// holding `"` may stay single or backtick.
const rules: StylisticRules = {
    "@stylistic/semi": ["error", "never"],
    "@stylistic/quotes": ["error", "double", {avoidEscape: true, allowTemplateLiterals: "avoidEscape"}],
    "@stylistic/indent": ["error", 4],
    "@stylistic/comma-dangle": ["error", "always-multiline"],
    "@stylistic/object-curly-spacing": ["error", "never"],
}

// Stylistic-only setup migrated from the `.ts` parts of .prettierrc.
// The core ESLint linter is intentionally left off for now: we register
// the TypeScript parser so .ts files can be read, but enable no lint
// rules beyond the @stylistic formatting rules above.
const eslintConfig: Linter.Config[] = [
    // Run as `eslint .` and let files/ignores below pick the targets.
    // dist holds generated output; without this, default JS linting of
    // its .mjs files would pull build artifacts into the run.
    {ignores: ["dist/**"]},
    {
        files: ["builder/**/*.ts", "src/**/*.ts", "types/**/*.ts"],
        plugins: {
            "@stylistic": stylistic,
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                sourceType: "module",
            },
        },
        rules,
    },
]

export default eslintConfig

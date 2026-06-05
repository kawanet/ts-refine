import stylistic from "@stylistic/eslint-plugin"
import tsParser from "@typescript-eslint/parser"

// Stylistic-only setup migrated from the `.ts` parts of .prettierrc.
// The core ESLint linter is intentionally left off for now: we register
// the TypeScript parser so .ts files can be read, but enable no lint
// rules beyond the @stylistic formatting rules below.
export default [
    {
        files: ["src/**/*.ts", "types/**/*.ts"],
        plugins: {
            "@stylistic": stylistic,
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                sourceType: "module",
            },
        },
        // Each rule mirrors a .prettierrc option. `printWidth` has no
        // equivalent here because ESLint does not re-wrap long lines.
        // quotes avoidEscape mirrors Prettier picking the quote style
        // that minimizes escapes, so strings holding `"` may stay single
        // or backtick.
        rules: {
            "@stylistic/semi": ["error", "never"],
            "@stylistic/quotes": ["error", "double", {avoidEscape: true, allowTemplateLiterals: "avoidEscape"}],
            "@stylistic/indent": ["error", 4],
            "@stylistic/comma-dangle": ["error", "always-multiline"],
            "@stylistic/object-curly-spacing": ["error", "never"],
        },
    },
]

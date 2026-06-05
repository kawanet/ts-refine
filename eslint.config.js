// ESLint loads this .js entry directly, so it does not require `jiti`
// to read a TypeScript config. The typed config lives in builder/ where
// tsconfig already type-checks it; Node's native type stripping loads
// the .ts when this file re-exports it. The .ts is deliberately not
// named eslint.config.ts so ESLint does not auto-discover it as a config.
export {default} from "./builder/eslint-config.ts"

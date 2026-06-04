import nodeResolve from "@rollup/plugin-node-resolve"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {isExternal} from "./externals.ts"
import {showFiles} from "./show-files.ts"

const rollupConfig: RollupOptions = {
    input: "../src/index.ts",

    output: {
        file: "../dist/ts-refine.mjs",
        format: "esm",
    },

    external: isExternal,

    plugins: [
        nodeResolve({
            extensions: [".ts", ".js"],
            preferBuiltins: true,
        }),

        // show files imported from outside /src/, inside /src/cli/, etc.
        showFiles({test: (path) => !path.includes("src/") || path.includes("src/cli") || path.includes(".test.") || path.includes("node_modules/")}),

        sucrase({
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),
    ],
}

export default rollupConfig

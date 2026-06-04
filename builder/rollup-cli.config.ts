import alias from "@rollup/plugin-alias"
import nodeResolve from "@rollup/plugin-node-resolve"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {isExternal} from "./externals.ts"
import {showFiles} from "./show-files.ts"

const rollupConfig: RollupOptions = {
    input: "../src/cli.ts",

    output: {
        file: "../dist/ts-refine.cli.mjs",
        format: "esm",
    },

    external: isExternal,

    plugins: [
        alias({
            entries: [
                {
                    find: /^(\.\.?\/)+index\.ts$/,
                    replacement: "ts-refine",
                },
            ],
        }),

        nodeResolve({
            extensions: [".ts", ".js"],
            preferBuiltins: true,
        }),

        // show files imported from outside /src/cli/, /src/common/, etc.
        showFiles({test: (path) => !(path.includes("src/cli") || path.includes("src/common/")) || path.includes(".test.") || path.includes("node_modules/")}),

        sucrase({
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),
    ],
}

export default rollupConfig

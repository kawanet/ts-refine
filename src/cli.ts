#!/usr/bin/env node

// Thin .ts entry point: forward argv/stdout to refineCLI, print any error it
// throws to stderr, and exit with the resulting status. Owning error display
// here lets command code fail simply by throwing — the message reaches the
// user and the process exits 1.

import {refineCLI} from "./cli/refine-cli.ts"

refineCLI({args: {}, tokens: process.argv.slice(2), stream: process.stdout, log: process.stderr})
    .catch((e) => {
        console.error(e instanceof Error ? e.message : String(e))
        return 1
    })
    .then((status) => process.exit(status))

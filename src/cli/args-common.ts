// CommonArgs holds the position-independent global options every command
// shares. parseCommonArgs fills it incrementally rather than pre-scanning all
// of argv: the router consumes the leading globals with it, and each command
// parser calls it inside its own loop, so -p / --dry-run work on either side
// of the subcommand.

export interface CommonArgs {
    tsconfigPath: string | null
    dryRun: boolean
}

// Consumes a global option at argv[index], writing it into `args`. Returns the
// number of tokens consumed, 0 if argv[index] is not a global, or -1 if it is
// a global but malformed (a duplicate -p, or a missing value) — in which case
// the specific error is already on stderr.
export function parseCommonArgs(args: CommonArgs, argv: string[], index: number): number {
    const a = argv[index]
    if (a === "-p" || a === "--project") {
        const v = argv[index + 1]
        if (!v || v.startsWith("-")) {
            console.error(`${a} requires a path (e.g. ${a} tsconfig.json)`)
            return -1
        }
        if (args.tsconfigPath !== null) {
            console.error(`${a} cannot be combined with another tsconfig path`)
            return -1
        }
        args.tsconfigPath = v
        return 2
    }
    if (a === "--dry-run") {
        args.dryRun = true
        return 1
    }
    return 0
}

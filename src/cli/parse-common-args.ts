// CommonArgs holds the position-independent global options every command
// shares. parseCommonArgs fills it incrementally rather than pre-scanning all
// of argv: the router consumes the leading globals with it, and each command
// parser calls it inside its own loop, so -p / --dry-run / --help work on
// either side of the subcommand.

export interface CommonArgs {
    tsconfigPath?: string
    dryRun?: boolean
    help?: boolean
}

// Consumes a global option at argv[index], writing it into `args`. Returns the
// number of tokens consumed, or 0 if argv[index] is not a global. A malformed
// global (a duplicate -p, or a missing value) throws.
export function parseCommonArgs(args: CommonArgs, argv: string[], index: number): number {
    const a = argv[index]
    if (a === "-p" || a === "--project") {
        const v = argv[index + 1]
        if (!v || v.startsWith("-")) {
            throw new Error(`${a} requires a path (e.g. ${a} tsconfig.json)`)
        }
        if (args.tsconfigPath != null) {
            throw new Error(`${a} cannot be combined with another tsconfig path`)
        }
        args.tsconfigPath = v
        return 2
    }
    if (a === "--dry-run") {
        args.dryRun = true
        return 1
    }
    if (a === "-h" || a === "--help") {
        args.help = true
        return 1
    }
    return 0
}

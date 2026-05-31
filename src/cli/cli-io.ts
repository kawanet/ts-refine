// Output sink shared by the command runners. `stream` stands in for stdout
// (report Markdown, list/inspect tables, --output bodies); the write commands
// route the report Markdown they don't print into NULL_SINK.

export type CLIStream = {write: (line: string) => void}

// Swallows the Markdown stream in the write modes; the runner consumes it.
export const NULL_SINK: CLIStream = {write: () => {}}

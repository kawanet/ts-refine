import path from "node:path"
import type {Plugin} from "rollup"

/**
 * Rollup plugin that logs every module the bundle pulls in.
 *
 * Output is normally just a handful of lines — the project's own `lib/`
 * files — so it does not clutter CI logs. The point is the inverse case:
 * if a misconfiguration starts dragging in a transitive dep tree or a
 * Node built-in, the import list balloons and is immediately visible.
 * That early signal is exactly why this plugin exists, so it should not
 * be mistaken for noise and removed.
 */
export const showFiles = (test?: {test: (path: string) => boolean}): Plugin => {
    const projectRoot = path.join(import.meta.dirname, "../_").replace(/_$/, "")

    return {
        name: "show-files",
        load(id) {
            id = id.replace(projectRoot, "")
            if (test && !test.test(id)) return
            console.warn(`import: ${id}`)
        },
    }
}

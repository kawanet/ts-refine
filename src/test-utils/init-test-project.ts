// Test project factory. Pins skipLoadingLibFiles: true — the refactoring suites
// operate on their own source symbols and never need the standard library
// declarations, so skipping the lib.d.ts load makes the program build
// dramatically cheaper. Test-only: production must keep the libs for correct
// semantics on real projects. (The in-memory factory moved to common/init-project.)

import {Project} from "../bridge/bridge.ts"

// Builds a project from a tsconfig on disk (sample fixtures, on-disk cases).
export function initTestProject(tsConfigFilePath: string): Project {
    return new Project({tsConfigFilePath, skipLoadingLibFiles: true})
}

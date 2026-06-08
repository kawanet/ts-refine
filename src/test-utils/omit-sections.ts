// Drop the display `sections` slot so a report test can assert the
// recommendation shape on its own, independent of the rendered table.

export function omitSections<T extends {sections?: unknown}>(report: T): Omit<T, "sections"> {
    const {sections: _sections, ...rest} = report
    return rest
}

export function add(a: number, b: number): number {
	return a + b
}

export function subtract(a: number, b: number): number {
	if (a > b) {
		return a - b
	}
	return b - a
}

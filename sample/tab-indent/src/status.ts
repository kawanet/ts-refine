export type Status = "active" | "inactive" | "pending"

export function getStatus(value: string): Status {
	switch (value) {
		case "active":
			return "active"
		case "inactive":
			return "inactive"
		default:
			return "pending"
	}
}

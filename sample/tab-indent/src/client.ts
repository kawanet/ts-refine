export interface Config {
	host: string
	port: number
	timeout?: number
}

export class Client {
	private config: Config

	constructor(config: Config) {
		this.config = config
	}

	connect(): boolean {
		if (!this.config.host) {
			return false
		}
		return true
	}
}

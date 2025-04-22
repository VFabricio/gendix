export class Secret {
	#value: string;

	constructor(value: string) {
		this.#value = value;
	}

	unsafeReveal(): string {
		return this.#value;
	}

	toString(): string {
		return '[SECRET]';
	}

	toJSON(): string {
		return '[SECRET]';
	}

	[Symbol.toPrimitive](): string {
		return '[SECRET]';
	}
}

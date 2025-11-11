export class EventEmitter<T> {
	#listeners: ((event: T) => void)[] = [];
	addListener(listener: (event: T) => void) {
		this.#listeners.push(listener);
		return {
			[Symbol.dispose]: () => {
				const index = this.#listeners.indexOf(listener);
				if (index > -1) this.#listeners.splice(index, 1);
			}
		}
	}

	emit(event: T) {
		this.#listeners.forEach(listener => listener(event));
	}

	toStream(): AsyncIterableStream<T, undefined> & Disposable {
		const stream = new AsyncIterableStream<T, undefined>();
		const listener = this.addListener((event) => stream.emit(event));
		
		// @ts-expect-error add dispose method
		stream[Symbol.dispose] = () => {
			listener[Symbol.dispose]();
			stream.close(undefined);
		}

		// @ts-expect-error added dispose method
		return stream;
	}
}

export class AsyncIterableStream<T, R> implements AsyncIterableIterator<T, R> {
	#queue: T[] = [];
	#resolvers: ((value: IteratorResult<T>) => void)[] = [];
	#done = false;
	#r?: R;

	emit(value: T) {
		if (this.#resolvers.length > 0) {
			const resolver = this.#resolvers.shift()!;
			resolver({ value, done: false });
		} else {
			this.#queue.push(value);
		}
	}

	close(r: R): void {
		this.#done = true;
		this.#r = r;
		while (this.#resolvers.length > 0) {
			const resolver = this.#resolvers.shift()!;
			resolver({ value: r, done: true });
		}
	}

	async next(): Promise<IteratorResult<T>> {
		if (this.#queue.length > 0) {
			const value = this.#queue.shift()!;
			return { value, done: false };
		}
		if (this.#done) {
			return { value: this.#r, done: true };
		}
		return new Promise<IteratorResult<T>>(resolve => {
			this.#resolvers.push(resolve);
		}).then(result => {
			return result;
		});
	}

	[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		return this;
	}
}
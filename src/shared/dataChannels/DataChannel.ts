import { AsyncIterableStream, EventEmitter } from "../EventEmitter.js";

export interface DataChannel<Inbound, Outbound> extends Disposable {
	readonly onMessage: EventEmitter<Inbound>
	send(message: Outbound): void;
}

export class EmptyDataChannel<Inbound, Outbound> implements DataChannel<Inbound, Outbound> {
	constructor(
		readonly onMessage = new EventEmitter<Inbound>()
	) {}

	send = (_message: Outbound) => {
		// do nothing
	}
	
	[Symbol.dispose] = () => {
		// do nothing
	}
}

export class LocalBroadcastDataChannel<T> {
	readonly onMessage = new EventEmitter<T>();
	readonly broadcastChannel: BroadcastChannel;

	send(message: T) {
		this.broadcastChannel.postMessage(message);
	}
	
	constructor(name: string) {
		this.broadcastChannel = new BroadcastChannel(name);
		this.broadcastChannel.onmessage = event => this.onMessage.emit(event.data);
	}

	[Symbol.dispose]() {
		this.broadcastChannel.close();
	}
}

export class TransformerDataChannel<Inbound, Outbound, OriginalInbound, OriginalOutbound> implements DataChannel<Inbound, Outbound> {
	readonly onMessage = new EventEmitter<Inbound>();
	readonly #inboundStream;
	readonly #outboundStream = new AsyncIterableStream<Outbound, void>();

	constructor(readonly options: {
		readonly original: DataChannel<OriginalInbound, OriginalOutbound>,
		readonly disposeOriginal: boolean,
		readonly inbound: (input: AsyncIterable<OriginalInbound>) => AsyncIterable<Inbound>,
		readonly outbound: (output: AsyncIterable<Outbound>) => AsyncIterable<OriginalOutbound>,
	}) {
		this.#inboundStream = this.options.original.onMessage.toStream();
		this.#setup();
	}

	#setup() {
		(async () => {
			for await (const message of this.options.inbound(this.#inboundStream)) {
				this.onMessage.emit(message);
			}
		})();

		(async () => {
			for await (const message of this.options.outbound(this.#outboundStream)) {
				this.options.original.send(message);
			}
		})();
	}

	send(message: Outbound): void {
		this.#outboundStream.emit(message);
	}

	[Symbol.dispose]() {
		this.#inboundStream[Symbol.dispose]();
		if (this.options.disposeOriginal) {
			this.options.original[Symbol.dispose]();
		}
	}
}
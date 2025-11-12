import { AsyncIterableStream, EventEmitter } from "../EventEmitter.js";

export interface DataChannel<Inbound, Outbound> extends Disposable {
	readonly onMessage: EventEmitter<Inbound>
	send(message: Outbound): void;
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

	constructor(private readonly options: {
		readonly original: DataChannel<OriginalInbound, OriginalOutbound>,
		readonly disposeOriginal: boolean,
		readonly extraDisposables?: Disposable[],
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
		for (const disposable of this.options.extraDisposables ?? []) {
			disposable[Symbol.dispose]();
		}
	}
}

export type MergedChanelMessage<T> = {
	id: string;
	message: T;
};

export class MergedChannel<Inbound, Outbound> implements DataChannel<MergedChanelMessage<Inbound>, Outbound> {
	readonly onMessage = new EventEmitter<MergedChanelMessage<Inbound>>();
	readonly #individualChannels = new Map<string, DataChannel<Inbound, Outbound>>();
	readonly #disposables = new Map<string, Disposable[]>();
	readonly #extraDisposables: Disposable[] = [];

	constructor(readonly options: {
		readonly disposeChildren: boolean;
	}) {}

	addDisposable(disposable: Disposable) {
		this.#extraDisposables.push(disposable);
	}

	addChild(id: string, channel: DataChannel<Inbound, Outbound>) {
		this.#individualChannels.set(id, channel);

		const disposables: Disposable[] = [];
		this.#disposables.set(id, disposables);

		const listener = channel.onMessage.addListener((message) => {
			this.onMessage.emit({ id, message });
		});

		disposables.push(listener);

		if (this.options.disposeChildren) {
			disposables.push(channel);
		}
	}

	removeChild(id: string) {
		this.#individualChannels.delete(id);
		const disposables = this.#disposables.get(id);
		if (!disposables) return;
		for (const disposable of disposables) {
			disposable[Symbol.dispose]();
		}
		this.#disposables.delete(id);
	}

	send(message: Outbound) {
		for (const [_peerId, channel] of this.#individualChannels) {
			channel.send(message);
		}
	}

	[Symbol.dispose]() {
		for (const [_peerId, channel] of this.#individualChannels) {
			channel[Symbol.dispose]();
		}
		this.#individualChannels.clear();
	}
}
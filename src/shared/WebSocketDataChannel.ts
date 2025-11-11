import { EventEmitter } from "./EventEmitter.js";
import type { DataChannel } from "./dataChannels/DataChannel.js";

export interface WebsocketDataChannelOptions<Incoming, Outgoing> {
	encode: (msg: Outgoing) => string | ArrayBufferLike | Blob | ArrayBufferView,
	decode: (data: any) => Incoming,
	filter: (input: Incoming) => boolean,
}

export class WebSocketDataChannel<Incoming, Outgoing = Incoming> implements DataChannel<Incoming, Outgoing> {
	readonly onMessage = new EventEmitter<Incoming>();
	readonly #ws: WebSocket;
	readonly #encode: (msg: Outgoing) => string | ArrayBufferLike | Blob | ArrayBufferView;
	readonly #decode: (data: any) => Incoming;

	static fromUrl<Incoming, Outgoing = Incoming>(url: string, options?: Partial<WebsocketDataChannelOptions<Incoming, Outgoing>>) {
		const ws = new WebSocket(url);
		return new WebSocketDataChannel<Incoming, Outgoing>(ws, options);
	}
	
	constructor(ws: WebSocket, options?: Partial<WebsocketDataChannelOptions<Incoming, Outgoing>>) {
		this.#encode = options?.encode ?? WebSocketDataChannel.defaultEncoder;
		this.#decode = options?.decode ?? WebSocketDataChannel.defaultDecoder;

		this.#ws = ws;
		this.#ws.addEventListener("message", (ev) => {
			const incoming = this.#decode(ev.data);
			this.onMessage.emit(incoming);
		});
	}

	send(message: Outgoing): void {
		const payload = this.#encode(message);
		this.#ws.send(payload);
	}

	[Symbol.dispose]() {
		this.#ws.close();
	}

	static defaultEncoder = <T>(msg: T): string => JSON.stringify(msg);
	static defaultDecoder = <T>(data: any): T => JSON.parse(`${data}`);
}

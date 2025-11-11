import { EventEmitter } from "../EventEmitter.js";
import type { DataChannel } from "./DataChannel.js";

export interface WebsocketDataChannelOptions<Incoming, Outgoing> {
	encode: (msg: Outgoing) => string | ArrayBufferLike | Blob | ArrayBufferView,
	decode: (data: any) => Incoming,
	onOpen: () => void,
	onError: (err: Event) => void,
	onClose: (ev: CloseEvent) => void,
	filter: (input: Incoming) => boolean,
}

export class WebsocketDataChannel<Incoming, Outgoing = Incoming> implements DataChannel<Incoming, Outgoing> {
	readonly onMessage = new EventEmitter<Incoming>();
	readonly #ws: WebSocket;
	readonly #encode: (msg: Outgoing) => string | ArrayBufferLike | Blob | ArrayBufferView;
	readonly #decode: (data: any) => Incoming;

	static fromUrl<Incoming, Outgoing = Incoming>(url: string, options?: Partial<WebsocketDataChannelOptions<Incoming, Outgoing>>) {
		const ws = new WebSocket(url);
		return new WebsocketDataChannel<Incoming, Outgoing>(ws, options);
	}
	
	constructor(ws: WebSocket, options?: Partial<WebsocketDataChannelOptions<Incoming, Outgoing>>) {
		this.#encode = options?.encode ?? WebsocketDataChannel.defaultEncoder;
		this.#decode = options?.decode ?? WebsocketDataChannel.defaultDecoder;

		this.#ws = ws;
		this.#ws.addEventListener("message", (ev) => {
			const incoming = this.#decode(ev.data);
			this.onMessage.emit(incoming);
		});
		if (options?.onOpen) this.#ws.addEventListener("open", options.onOpen);
		if (options?.onError) this.#ws.addEventListener("error", options.onError);
		if (options?.onClose) this.#ws.addEventListener("close", options.onClose);
	}

	send(message: Outgoing): void {
		const payload = this.#encode(message);
		this.#ws.send(payload);
	}

	[Symbol.dispose]() {
		this.#ws.close();
	}

	static defaultEncoder = <T>(msg: T): string => JSON.stringify(msg);
	static defaultDecoder = <T>(data: any): T => {
		try {
			return JSON.parse(typeof data === "string" ? data : data?.toString?.() ?? "");
		} catch {
			return data as T;
		}
	}
}

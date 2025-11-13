import type { DataChannel } from "./DataChannel.js";
import { EventEmitter } from "../EventEmitter.js";


export class WebRTCDataChannel<T> implements DataChannel<unknown, T> {
	readonly onMessage = new EventEmitter<unknown>();

	constructor(readonly options: {
		readonly dataChannel: RTCDataChannel,
		readonly dispose: boolean,
	}) {
		this.options.dataChannel.onmessage = (event) => {
			this.onMessage.emit(JSON.parse(event.data));
		}
	}

	get readyState() {
		return this.options.dataChannel.readyState;
	}

	send(message: T): void {
		if (this.readyState !== "open") {
			console.warn(`DataChannel is not open (current state: ${this.readyState}). Message not sent.`, message);
			return;
		}

		this.options.dataChannel.send(JSON.stringify(message));
	}

	[Symbol.dispose]() {
		if (this.options.dispose) {
			this.options.dataChannel.close();
		}
	}
}
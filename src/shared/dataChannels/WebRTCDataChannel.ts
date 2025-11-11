import type { DataChannel } from "./DataChannel.js";
import { EventEmitter } from "../EventEmitter.js";


export class WebRTCDataChannel<T> implements DataChannel<T, T> {
	readonly onMessage = new EventEmitter<T>();

	constructor(readonly options: {
		readonly dataChannel: RTCDataChannel,
		readonly disposeDataChannel: boolean,
	}) {
		this.options.dataChannel.onmessage = (event) => {
			this.onMessage.emit(JSON.parse(event.data) as T);
		}
	}
 
	static fromPeer<T>({ pc, label}: { pc: RTCPeerConnection, label: string }) {
		return new WebRTCDataChannel<T>({
			dataChannel: pc.createDataChannel(label),
			disposeDataChannel: true,
		});
	}

	static fromEvent<T>({ event }: { event: RTCDataChannelEvent }) {
		return new WebRTCDataChannel<T>({
			dataChannel: event.channel,
			disposeDataChannel: true,
		});
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
		if (this.options.disposeDataChannel) {
			this.options.dataChannel.close();
		}
	}
}
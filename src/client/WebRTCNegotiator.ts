import type { Relay } from "../shared/relay/RelayPackets.js";
import { TransformerDataChannel, type DataChannel } from "../shared/dataChannels/DataChannel.js";
import { EventEmitter } from "../shared/EventEmitter.js";
import { RTCNegotiationMessage, webRTCPerfectNegotiation } from "../shared/webRTCPerfectNegotiation.js";
import type { RelayClient } from "../shared/relay/RelayClient.js";


export class WebRTCNegotiator {
	readonly peers = new Map<string, RTCPeerConnection>();
	readonly onCreatePeer = new EventEmitter<{ id: string, pc: RTCPeerConnection }>();
	readonly onJoinPeer = new EventEmitter<{ id: string, pc: RTCPeerConnection }>();
	readonly onRemovePeer = new EventEmitter<{ id: string }>();
	readonly #signalChannels = new Map<string, DataChannel<RTCNegotiationMessage, RTCNegotiationMessage>>();

	#listener: Disposable;

	[Symbol.dispose]() {
		for (const [_id, pc] of this.peers) {
			pc.close();
		}

		this.#listener[Symbol.dispose]();
		this.peers.clear();
	}

	removePeer(id: string) {
		const pc = this.peers.get(id);
		if (pc) {
			pc.close();
			this.peers.delete(id);
		}

		const signalingChannel = this.#signalChannels.get(id);
		if (signalingChannel) {
			signalingChannel[Symbol.dispose]();
			this.#signalChannels.delete(id);
		}

		this.onRemovePeer.emit({ id });
	}

	constructor(
		readonly signalServer: RelayClient,
		readonly myId: string,
		webRTCConfiguration: RTCConfiguration = {}
	) {
		const peers = this.peers;

		this.#listener = this.signalServer.onMessage.addListener((signalMessage) => {
			// ignore own messages
			if (signalMessage.user === myId) return;

			// process leave messages
			if (signalMessage.type === "leave") {
				this.removePeer(signalMessage.user);
				return;
			}

			const peerId = signalMessage.user;
			
			// register a peer
			if (!peers.has(peerId)) {
				// set up signaling channel
				const signalingChannel = new TransformerDataChannel({
					original: signalServer,
					disposeOriginal: false,
					async *inbound(messages) {
						// include the current signal message
						const allMessages = concatAsync([signalMessage], messages);
						for await (const message of allMessages) {
							if (message.user === myId) continue;
							if (message.user !== peerId) continue;
							if (message.type !== "message") continue;

							if (!RTCNegotiationMessage.isInstance(message.content)) continue;
							yield message.content;
						}
					},
					async *outbound(messages) {
						for await (const message of messages) {
							yield { type: "message", recipients: [peerId], content: message } satisfies Relay.ServerBoundPacket;
						}
					}
				}) satisfies DataChannel<RTCNegotiationMessage, RTCNegotiationMessage>;

				const pc = new RTCPeerConnection(webRTCConfiguration);
				peers.set(peerId, pc);
				this.#signalChannels.set(peerId, signalingChannel);

				const isPolite = peerId.localeCompare(myId) > 0;
				webRTCPerfectNegotiation(signalingChannel, pc, isPolite);

				pc.oniceconnectionstatechange = () => {
					if (pc.iceConnectionState === "failed") pc.restartIce();
				}

				this.onCreatePeer.emit({ id: peerId, pc });
			}

			if (signalMessage.type === "join") {
				this.onJoinPeer.emit({ id: peerId, pc: peers.get(peerId)! });
			}
		});
	}
}

async function *concatAsync<T>(...iterables: (Iterable<T> | AsyncIterable<T>)[]): AsyncIterable<T> {
	for (const iterable of iterables) {
		yield* iterable;
	}
}

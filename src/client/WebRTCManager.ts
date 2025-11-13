import type { Relay } from "../shared/relay/RelayPackets.js";
import { TransformerDataChannel, type DataChannel } from "../shared/dataChannels/DataChannel.js";
import { EventEmitter } from "../shared/EventEmitter.js";
import { RTCNegotiationMessage, webRTCPerfectNegotiation } from "../shared/webRTCPerfectNegotiation.js";
import type { RelayClient } from "../shared/relay/RelayClient.js";


export class WebRTCManager {
	readonly peers = new Map<string, RTCPeerConnection>();
	readonly onCreatePeer = new EventEmitter<{ id: string, pc: RTCPeerConnection }>();
	readonly onRemovePeer = new EventEmitter<{ id: string }>();
	readonly onConnectionStateChange = new EventEmitter<{ id: string, pc: RTCPeerConnection }>();
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
		this.#listener = this.signalServer.onMessage.addListener((signalMessage) => {
			const peerId = signalMessage.user;

			// ignore own messages
			if (peerId === myId) return;

			// process leave messages
			if (signalMessage.type === "leave") {
				this.removePeer(peerId);
				return;
			}


			// negotiations happen lazily, ping the other peer so they know about us immediately
			if (signalMessage.type === "join") {
				signalServer.send({ type: "message", content: "ping", recipients: [peerId] });
			}

			
			// peer already exists
			if (this.peers.has(peerId)) return;

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

			// create peer connection
			const pc = new RTCPeerConnection(webRTCConfiguration);
			this.peers.set(peerId, pc);
			this.#signalChannels.set(peerId, signalingChannel);

			// connect using perfect negotiation
			const isPolite = peerId.localeCompare(myId) > 0;
			webRTCPerfectNegotiation(signalingChannel, pc, isPolite);

			// emit connection state changes
			pc.oniceconnectionstatechange = () => {
				this.onConnectionStateChange.emit({ id: peerId, pc });
			}

			// emit create event
			this.onCreatePeer.emit({ id: peerId, pc });
		});
	}
}

async function *concatAsync<T>(...iterables: (Iterable<T> | AsyncIterable<T>)[]): AsyncIterable<T> {
	for (const iterable of iterables) {
		yield* iterable;
	}
}

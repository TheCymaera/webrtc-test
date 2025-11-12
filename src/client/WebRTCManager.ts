import type { Relay } from "../shared/relay/RelayPackets.js";
import { EmptyDataChannel, TransformerDataChannel, type DataChannel } from "../shared/dataChannels/DataChannel.js";
import { EventEmitter } from "../shared/EventEmitter.js";
import { RTCNegotiationMessage, webRTCPerfectNegotiation } from "../shared/webRTCPerfectNegotiation.js";
import type { RelayClient } from "../shared/relay/RelayClient.js";
import { WebRTCDataChannel } from "../shared/dataChannels/WebRTCDataChannel.js";


export class WebRTCManager {
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
			if (!this.peers.has(peerId)) {
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

				// restart ICE on failure
				pc.oniceconnectionstatechange = () => {
					if (pc.iceConnectionState === "failed") pc.restartIce();
				}

				// emit create event
				this.onCreatePeer.emit({ id: peerId, pc });
			}

			if (signalMessage.type === "join") {
				// emit join event
				this.onJoinPeer.emit({ id: peerId, pc: this.peers.get(peerId)! });
			}
		});
	}

	createMergedChannel<Outbound>() {
		type Inbound = unknown;

		// Set up individual data channels per peer
		type MergedMessage = { peerId: string, message: Inbound };
		const mergedChannel = new EmptyDataChannel() satisfies DataChannel<MergedMessage, Outbound>;
		const individualChannels = new Map<string, WebRTCDataChannel<Inbound>>();
	
		mergedChannel[Symbol.dispose] = () => {
			for (const [_peerId, channel] of individualChannels) {
				channel[Symbol.dispose]();
			}
		}
	
		mergedChannel.send = (message: Outbound) => {
			// send to all individual channels
			for (const [_peerId, channel] of individualChannels) {
				channel.send(message);
			}
		}

		function initDataChannel(peerId: string, individualChannel: WebRTCDataChannel<Inbound>) {
			individualChannels.set(peerId, individualChannel);
	
			// relay messages to merged channel
			individualChannel.onMessage.addListener((message) => {
				mergedChannel.onMessage.emit({ peerId, message });
			});
		}
	
		this.onJoinPeer.addListener(({id, pc}) => {
			// create data channel
			const dataChannel = WebRTCDataChannel.fromPeer<Inbound>({ pc, label: "chat" });
			initDataChannel(id, dataChannel);
		});

		this.onCreatePeer.addListener(({id, pc}) => {
			// be ready to receive data channel
			pc.ondatachannel = event => {
				const dataChannel = WebRTCDataChannel.fromEvent<Inbound>({ event });
				initDataChannel(id, dataChannel);
			};
		});

		return mergedChannel;
	}
}

async function *concatAsync<T>(...iterables: (Iterable<T> | AsyncIterable<T>)[]): AsyncIterable<T> {
	for (const iterable of iterables) {
		yield* iterable;
	}
}

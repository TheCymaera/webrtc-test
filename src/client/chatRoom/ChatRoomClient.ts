import { LocalBroadcastDataChannel, TransformerDataChannel, type DataChannel } from "../../shared/dataChannels/DataChannel.js";
import { RelayClient } from "../../shared/relay/RelayClient.js";
import { WebRTCManager } from "../WebRTCManager.js";
import { ChatRoom } from "./ChatRoomPackets.js";



export type ChatRoomClient = DataChannel<ChatRoom.InboundPacket, ChatRoom.OutboundPacket>;

export namespace ChatRoomClient {
	export const createLocal = createLocalChatRoom;
	export const createWebsocket = createWebsocketChatRoom;
	export const createWebRTC = createWebRTChatRoom;
}

function createLocalChatRoom(roomId: string) {
	const myId = crypto.randomUUID() as string;

	const dataChannel = new TransformerDataChannel({
		original: new LocalBroadcastDataChannel<ChatRoom.InboundPacket>(roomId),
		disposeOriginal: true,
		async *inbound(message) {
			yield* message;
		},
		async *outbound(messages) {
			for await (const message of messages) {
				yield { ...message, user: myId };
			}
		}
	}) satisfies ChatRoomClient;

	dataChannel.options.original.send({ type: "join", user: myId });

	return { myId, dataChannel };
}


async function createWebsocketChatRoom(roomId: string) {
	const { myId, dataChannel } = await RelayClient.createAndWaitForId({ roomId });

	const transformer = new TransformerDataChannel({
		original: dataChannel,
		disposeOriginal: true,
		async *inbound(messages) {
			for await (const message of messages) {
				if (message.type === "join" || message.type === "leave") {
					yield message;
					continue;
				}

				if (message.type === "message") {
					const messageAsString = 
						typeof message.content === "string" ? message.content : 
						jsonMarkdown(message.content);
					
					yield { ...message, content: messageAsString };
					continue;
				}
			}
		},
		async *outbound(messages) {
			yield *messages;
		}
	}) satisfies ChatRoomClient;

	return { myId, dataChannel: transformer }
}

async function createWebRTChatRoom(roomId: string) {
	// Get ice servers
	const iceServers = await fetch("/api/ice").then(res => res.json()).then(data => data.iceServers as RTCIceServer[]);
	console.log("Received ICE servers:", iceServers);

	// Set up signal server
	const { dataChannel: signalServer, myId } = await RelayClient.createAndWaitForId({ roomId });
	
	const manager = new WebRTCManager(signalServer, myId, { iceServers });

	manager.onConnectionStateChange.addListener(({ id, pc }) => {
		const logMessage = `Connection state for peer ${id} changed to ${pc.connectionState}:`;
		const connectionType = pc.sctp?.transport.iceTransport.getSelectedCandidatePair();
		if (!connectionType) {
			console.log(logMessage);
		} else {
			console.groupCollapsed(logMessage);
			console.log(`  Local:`, connectionType.local);
			console.log(`  Remote:`, connectionType.remote);
			console.groupEnd();
		}
	});

	const transformed = new TransformerDataChannel({
		original: manager.createMergedChannel<ChatRoom.OutboundPacket>(),
		disposeOriginal: true,
		async *inbound(messages) {
			for await (const { peerId, message } of messages) {
				if (!ChatRoom.OutboundPacket.isInstance(message)) {
					console.warn("Received invalid ChatRoom packet:", message);
					yield { user: peerId, type: "message", content: jsonMarkdown(message) };
					continue;
				}

				yield { ...message, user: peerId } as ChatRoom.InboundPacket;
			}
		},
		async *outbound(messages) {
			yield *messages;
		}
	}) satisfies ChatRoomClient;

	manager.onJoinPeer.addListener(({ id }) => {
		transformed.onMessage.emit({ type: "join", user: id });
	});

	manager.onRemovePeer.addListener(({ id }) => {
		transformed.onMessage.emit({ type: "leave", user: id });
	});

	return { myId, dataChannel: transformed, negotiator: manager }
}

function jsonMarkdown(packet: unknown): string {
	return "```json\n" + JSON.stringify(packet, null, 2) + "\n```";
}
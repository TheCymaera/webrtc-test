import { LocalBroadcastDataChannel, MergedChannel, TransformerDataChannel, type DataChannel } from "../../shared/dataChannels/DataChannel.js";
import { WebRTCDataChannel } from "../../shared/dataChannels/WebRTCDataChannel.js";
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

	const broadcastChannel = new LocalBroadcastDataChannel<ChatRoom.InboundPacket>(roomId);
	broadcastChannel.send({ type: "join", user: myId });

	const dataChannel = new TransformerDataChannel({
		original: broadcastChannel,
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

	manager.onConnectionStateChange.addListener(({ pc }) => {
		if (pc.iceConnectionState === "failed") {
			pc.restartIce();
		}
	});

	const mergedChannel = new MergedChannel<unknown, ChatRoom.OutboundPacket>({
		disposeChildren: true
	});

	manager.onCreatePeer.addListener(({id, pc}) => {
		pc.ondatachannel = event => {
			const dataChannel = new WebRTCDataChannel<ChatRoom.OutboundPacket>({
				dataChannel: event.channel,
				dispose: true,
			});
			mergedChannel.addChild(id, dataChannel);
		};

		if (myId < id) {
			const dataChannel = new WebRTCDataChannel<ChatRoom.OutboundPacket>({
				dataChannel: pc.createDataChannel("chat"),
				dispose: true,
			});
			mergedChannel.addChild(id, dataChannel);
		}
	});

	manager.onRemovePeer.addListener(({ id }) => {
		mergedChannel.removeChild(id);
	});

	const transformer = new TransformerDataChannel({
		original: mergedChannel,
		disposeOriginal: true,
		extraDisposables: [signalServer, manager],
		async *inbound(messages) {
			for await (const { id, message } of messages) {
				if (!ChatRoom.OutboundPacket.isInstance(message)) {
					console.warn("Received invalid ChatRoom packet:", message);
					yield { user: id, type: "message", content: jsonMarkdown(message) };
					continue;
				}

				yield { ...message, user: id } as ChatRoom.InboundPacket;
			}
		},
		async *outbound(messages) {
			yield *messages;
		}
	}) satisfies ChatRoomClient;

	signalServer.onMessage.addListener((message) => {
		if (message.type === "join") {
			transformer.onMessage.emit({ type: "join", user: message.user });
		}
	});

	manager.onRemovePeer.addListener(({ id }) => {
		transformer.onMessage.emit({ type: "leave", user: id });
	});

	return {
		myId,
		webRTCManager: manager,
		dataChannel: transformer,
	}
}

function jsonMarkdown(packet: unknown): string {
	return "```json\n" + JSON.stringify(packet, null, 2) + "\n```";
}
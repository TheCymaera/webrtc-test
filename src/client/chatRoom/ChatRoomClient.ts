import { EmptyDataChannel, LocalBroadcastDataChannel, TransformerDataChannel, type DataChannel } from "../../shared/dataChannels/DataChannel.js";
import { WebRTCDataChannel } from "../../shared/dataChannels/WebRTCDataChannel.js";
import type { ChatRoom } from "./ChatRoomPackets.js";
import { RelayClient } from "../../shared/relay/RelayClient.js";
import { WebRTCNegotiator } from "../WebRTCNegotiator.js";

export type ChatRoomClient = DataChannel<ChatRoom.ClientBoundPacket, ChatRoom.ServerBoundPacket>;

export namespace ChatRoomClient {
	export const createLocal = createLocalChatRoom;
	export const createWebsocket = createWebsocketChatRoom;
	export const createWebRTC = createWebRTChatRoom;
}

function createLocalChatRoom(roomId: string) {
	const myId = crypto.randomUUID() as string;

	const dataChannel = new TransformerDataChannel({
		original: new LocalBroadcastDataChannel<ChatRoom.ClientBoundPacket>(roomId),
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
					const string = 
						typeof message.content === "string" ? message.content : 
						"```json\n" + JSON.stringify(message.content, null, 2) + "\n```";
					yield { ...message, content: string };
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
	// Set up signal server
	const { dataChannel: signalServer, myId } = await RelayClient.createAndWaitForId({ roomId });
	const negotiator = new WebRTCNegotiator(signalServer, myId);

	// Set up individual data channels per peer
	const individualChannels = new Map<string, WebRTCDataChannel<ChatRoom.ServerBoundPacket>>();
	const mergedChannel = new EmptyDataChannel() satisfies ChatRoomClient;

	mergedChannel[Symbol.dispose] = () => {
		negotiator[Symbol.dispose]();
		signalServer[Symbol.dispose]();
	}

	mergedChannel.send = (message: ChatRoom.ServerBoundPacket) => {
		// send to all individual channels
		for (const [_peerId, channel] of individualChannels) {
			if (message.type !== "message") continue;
			channel.send(message);
		}
	}

	function initDataChannel(peerId: string, individualChannel: WebRTCDataChannel<ChatRoom.ServerBoundPacket>) {
		individualChannels.set(peerId, individualChannel);

		// relay messages to merged channel
		individualChannel.onMessage.addListener((message) => {
			mergedChannel.onMessage.emit({ ...message, user: peerId });
		});
	}

	negotiator.onJoinPeer.addListener(({id, pc}) => {
		// create data channel
		const dataChannel = WebRTCDataChannel.fromPeer<ChatRoom.ServerBoundPacket>({ pc, label: "chat" });
		initDataChannel(id, dataChannel);
	});

	negotiator.onCreatePeer.addListener(({id, pc}) => {
		// be ready to receive data channel
		pc.ondatachannel = event => {
			const dataChannel = WebRTCDataChannel.fromEvent<ChatRoom.ServerBoundPacket>({ event });
			initDataChannel(id, dataChannel);
		};
	});

	negotiator.onRemovePeer.addListener(({id}) => {
		const individualChannel = individualChannels.get(id);
		if (individualChannel) {
			individualChannel[Symbol.dispose]();
			individualChannels.delete(id);
		}

		mergedChannel.onMessage.emit({ type: "leave", user: id });
	});

	return {
		myId,
		dataChannel: mergedChannel,
		negotiator,
	}
}
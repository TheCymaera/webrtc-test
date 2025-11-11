import { type DataChannel } from "../dataChannels/DataChannel.js";
import { WebsocketDataChannel } from "../dataChannels/WebsocketDataChannel.js";
import type { Relay } from "./RelayPackets.js";

export type RelayClient = DataChannel<Relay.ClientBoundPacket, Relay.ServerBoundPacket>;

export namespace RelayClient {
	export interface Options {
		readonly roomId: string;
		readonly relayToSelf?: boolean;
		readonly hostOneToMany?: boolean;
		readonly customUserId?: string;
	}

	export function urlFromOptions(options: RelayClient.Options) {
		const url = new URL(`ws://${window.location.host}/api/relay`);
		url.searchParams.set("room", options.roomId);
		if (options.hostOneToMany) {
			url.searchParams.set("host-one-to-many", "1");
		}
		if (options.relayToSelf) {
			url.searchParams.set("relay-to-self", "1");
		}
		if (options.customUserId) {
			url.searchParams.set("user-id", options.customUserId);
		}
		return url;
	}

	export function create(options: RelayClient.Options) {
		const url = urlFromOptions(options);
		return WebsocketDataChannel.fromUrl(url.toString()) satisfies RelayClient;
	}

	export async function createAndWaitForId(options: RelayClient.Options) {
		const dataChannel = create(options);
		let myId = "";
		let resolve: () => void;

		using _ = dataChannel.onMessage.addListener((msg) => {
			if (msg.type === "your-id") {
				myId = msg.content;
				resolve();
			}
		});

		await new Promise<void>(r => { resolve = r; });

		return { dataChannel, myId }
	}
}

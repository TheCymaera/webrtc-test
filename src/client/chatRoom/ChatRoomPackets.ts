export namespace ChatRoom {
	export type OutboundPacket = {
		type: "message";
		content: string;
	}

	export type InboundPacket = {
		user: string;
		type: "join"
	} | {
		user: string;
		type: "leave"
	} | {
		user: string;
		type: "message";
		content: string;
	}

	export namespace OutboundPacket {
		export function isInstance(packet: unknown): packet is OutboundPacket {
			if (typeof packet !== "object" || packet === null) return false;

			const record = packet as Record<string, unknown>;
			if (record.type === "message" && typeof record.content === "string") {
				return true;
			}

			return false;
		}
	}

}
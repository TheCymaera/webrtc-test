export namespace Relay {
	export type ClientBoundPacket = {
		user: string;
		type: "join"
	} | {
		user: string;
		type: "leave"
	} | {
		user: string;
		type: "message";
		content: unknown;
	} | {
		user: "@system";
		type: "your-id";
		content: string;
	}
	
	export type ServerBoundPacket = {
		type: "message";
		content: unknown;
		recipients?: string[];
	}

	export namespace ServerBoundPacket {
		export function isInstance(packet: unknown): packet is ServerBoundPacket {
			if (typeof packet !== "object" || packet === null) return false;
			
			const record = packet as Record<string, unknown>;
			if (record.type === "message") {
				if (!("content" in record)) return false;

				if (record.recipients !== undefined) {
					const isStringArray = Array.isArray(record.recipients) && record.recipients.every(r => typeof r === "string");
					if (!isStringArray) return false;
				}

				return true;
			}

			return false;
		}
	}
}
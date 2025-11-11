import { Relay } from "../shared/relay/RelayPackets.js";

function ok(text: string) { return new Response(text); }
function bad(text: string) { return new Response(text, { status: 400 }); }

interface WebsocketData {
	id: string;
	room: string;
}

const server = Bun.serve<WebsocketData>({
	port: 3000,
	async fetch(request, server) {
		const url = new URL(request.url);
		
		if (url.pathname !== "/api/relay") {
			return ok("WebSocket Relay Server is running.");
		}

		// Get room ID
		const roomId = url.searchParams.get("room");
		if (!roomId) return bad(`Parameter "room" is required`);

		// Get requested client ID and check if allowed
		const requestedClientId = url.searchParams.get("user-id");
		if (requestedClientId) {
			const existingRoom = Room.get(roomId);
			if (existingRoom && !existingRoom.allowCustomId) {
				return bad(`Room "${roomId}" already exists and does not allow custom IDs.`);
			}

			Room.getOrPut(roomId).allowCustomId = true;
		}

		// Generate client ID
		const clientId = requestedClientId ?? crypto.randomUUID();

		// By default, do not relay messages back to sender
		if (!url.searchParams.get("relay-to-self")) {
			Room.getOrPut(roomId).messageFilters.push((packet, recipientId) => {
				return packet.user !== recipientId;
			});
		}

		// One to many mode:
		// one client (the "host") can address all users,
		// other clients can only address the host
		// e.g. for multiplayer games with a single authoritative host
		if (url.searchParams.get("host-one-to-many")) {
			const existingRoom = Room.get(roomId);
			if (existingRoom) return bad(`Room "${roomId}" already exists, cannot join as one-to-many host.`);
			
			Room.getOrPut(roomId).messageFilters.push((packet, recipientId) => {
				const packetFromHost = packet.user === clientId;
				const packetToHost = recipientId === clientId;
				return packetFromHost || packetToHost;
			})
		}

		// Upgrade to WebSocket
		const success = server.upgrade(request, { data: { id: clientId, room: roomId } });
		if (!success) Room.removeIfEmpty(roomId);
		return success ? undefined : bad("WebSocket upgrade error");
	},
	websocket: {
		maxPayloadLength: 1024 * 1024, // 1 MB
		open(ws) {
			const data = ws.data;

			const room = Room.getOrPut(data.room)
			room.addClient(data.id, ws);

			// send the client their assigned ID
			sendPacket(ws, { user: "@system", type: "your-id", content: data.id });

			// join notification
			room.send({ user: data.id, type: "join" });
		},
		message(ws, rawMessage) {
			const data = ws.data;

			const packet = parsePacket(rawMessage);
			if (!packet) return;

			const room = Room.get(data.room);
			if (!room) {
				console.warn(`Received packet for non-existent room "${data.room}". This is not supposed to happen.`);
				return;
			}

			if (packet.type === "message") {
				const clientBound: Relay.ClientBoundPacket = { user: data.id, type: "message", content: packet.content };
				room.send(clientBound, packet.recipients);
			}
		},
		close(ws) {
			const data = ws.data;
			Room.removeClient(data.room, data.id);
			Room.get(data.room)?.send({ user: data.id, type: "leave" });
		},
	},
});

console.log(`WebSocket server listening on http://${server.hostname}:${server.port}`);


function sendPacket(client: Bun.ServerWebSocket<WebsocketData>, packet: Relay.ClientBoundPacket) {
	client.send(JSON.stringify(packet));
}

function parsePacket(raw: string | Buffer<ArrayBuffer>): Relay.ServerBoundPacket | undefined {
	if (typeof raw !== "string") return undefined;

	try {
		const parsed = JSON.parse(raw);
		if (!Relay.ServerBoundPacket.isInstance(parsed)) throw new Error("Invalid data structure");
		return parsed;
	} catch {
		// ignore malformed
		console.warn("Received malformed packet", raw);
		return undefined;
	}
}


class Room {
	static readonly registry = new Map<string, Room>();

	static getOrPut(room: string) {
		if (!this.registry.has(room)) {
			this.registry.set(room, new Room());
		}
		return this.registry.get(room)!;
	}

	static get(room: string) {
		return this.registry.get(room);
	}

	static removeIfEmpty(room: string) {
		const roomInstance = this.registry.get(room);
		if (!roomInstance) return;
		if (roomInstance.#clients.size === 0) this.registry.delete(room);
	}

	static removeClient(room: string, id: string) {
		const roomInstance = this.registry.get(room);
		if (!roomInstance) return;
		roomInstance.#clients.delete(id);
		if (roomInstance.#clients.size === 0) {
			this.registry.delete(room);
		}
	}

	readonly messageFilters: ((packet: Relay.ClientBoundPacket, recipientId: string) => boolean)[] = []
	allowCustomId = false;

	readonly #clients = new Map<string, Bun.ServerWebSocket<WebsocketData>>();

	addClient(id: string, client: Bun.ServerWebSocket<WebsocketData>) {
		this.#clients.set(id, client);
	}

	send(packet: Relay.ClientBoundPacket, recipients = [...this.#clients.keys()]) {
		for (const recipientId of recipients) {
			const client = this.#clients.get(recipientId);
			if (!client) continue;

			if (!this.messageFilters.every(filter => filter(packet, recipientId))) continue;

			sendPacket(client, packet);
		}
	}
}
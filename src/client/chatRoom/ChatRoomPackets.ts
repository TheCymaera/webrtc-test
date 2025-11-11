export namespace ChatRoom {
	export type ServerBoundPacket = {
		type: "message";
		content: string;
	}

	export type ClientBoundPacket = {
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
}
<script lang="ts">
	import { type ChatRoom } from "../chatRoom/ChatRoomPackets.js";
	import Chat from "./Chat.svelte";
	import { generateFavicon, nameFromUUID, setFavicon } from "./utilities.js";
	import { ChatRoomClient } from "../chatRoom/ChatRoomClient.js";
	import Avatar from "./Avatar.svelte";

	let messages: Array<ChatRoom.ClientBoundPacket> = $state([]);

	let hint: { type: "loading" | "error"; text: string } = $state({ type: "loading", text: "" });

	async function createClientFromURL() {
		const url = new URL(window.location.href);
		const roomId = url.searchParams.get("room") || "main-room";
		const implementation = url.searchParams.get("implementation") || "websocket";

		hint = { type: "loading", text: "Waiting for signal server handshake..." };
		if (implementation === "webrtc") {
			return await ChatRoomClient.createWebRTC(roomId);
		} else if (implementation === "websocket") {
			hint = { type: "loading", text: "Waiting for websocket handshake..." };
			return await ChatRoomClient.createWebsocket(roomId);
		} else if (implementation === "local") {
			return ChatRoomClient.createLocal(roomId);
		} else {
			throw new Error(`Invalid implementation: "${implementation}"`);
		}
	}

	let chatClient = $state<Awaited<ReturnType<typeof createClientFromURL>> | undefined>(undefined);
	window.addEventListener('beforeunload', () => chatClient?.dataChannel[Symbol.dispose]());

	async function initializeClient(newClient: NonNullable<typeof chatClient>) {
		chatClient?.dataChannel[Symbol.dispose]();
		chatClient = newClient;

		chatClient.dataChannel.onMessage.addListener((packet) => {
			messages.push(packet);
		});

		document.title = `Chat - ${nameFromUUID(chatClient.myId)}`;
		generateFavicon(chatClient.myId).then(setFavicon);
	}

	createClientFromURL()
	.then(initializeClient)
	.catch((err) => {
		hint = { type: "error", text: `${err.message}` };
		console.error(err);
	})


	let currentTime = $state(Date.now());
	setInterval(() => currentTime = Date.now());
	const updatePeriodically = <T>(value: T) => {
		currentTime; // update periodically
		return value;
	};
</script>
<div class="fixed inset-0 flex h-full items-stretch">
	<div class="flex-1">
		{#if chatClient}
			<Chat
				className="h-full"
				myId={chatClient.myId}
				messages={messages}
				onSendMessage={(text) => {
					if (!chatClient) return;

					const packet = { type: "message", content: text } as ChatRoom.ServerBoundPacket;
					chatClient.dataChannel.send(packet);
					messages.push({ user: chatClient.myId, ...packet });
				}}
			/>
		{:else}
			<div class="flex flex-col items-center justify-center h-full">
				<div class="
					flex items-center justify-center text-xl gap-5
					{hint.type === 'error' ? 'text-red-400' : 'text-onSurface/30'}
				">
					<div 
						class="
							w-[1.3em] h-[1.3em]
							border-[0.3em] border-currentColor
							border-t-transparent
							rounded-full
							animate-spin
						"
						hidden={hint.type !== "loading"}
					></div>
					{hint.text || "Loading..."}
				</div>
			</div>
		{/if}
	</div>

	{#if chatClient && "negotiator" in chatClient}
		<div class="bg-surfaceContainer w-100 p-4 overflow-y-auto">
			<h3 class="text-xl font-bold mb-3">Peers</h3>

			{#each updatePeriodically(chatClient.negotiator.peers) as [peerId, peer]}
				<div class="relative p-3">
					<div class="absolute top-3 left-3 w-10 h-10">
						<Avatar userId={peerId} />
					</div>	

					<div class="ml-15">
						<div class="font-bold">
							{nameFromUUID(peerId)}
						</div>

						<div class="whitespace-pre-wrap">
							{peer.connectionState}
						</div>
					</div>
				</div>
				
			{:else}
				<span class="font-mono">No connected peers</span>
			{/each}
		</div>
	{/if}
</div>
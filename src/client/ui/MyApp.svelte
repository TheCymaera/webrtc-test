<script lang="ts">
	import { type ChatRoom } from "../chatRoom/ChatRoomPackets.js";
	import Chat from "./Chat.svelte";
	import { generateFavicon, nameFromUUID, setFavicon } from "./utilities.js";
	import { ChatRoomClient } from "../chatRoom/ChatRoomClient.js";
	import Avatar from "./Avatar.svelte";
	import Markdown from "./Markdown.svelte";

	let messages: Array<ChatRoom.InboundPacket> = $state([]);

	let hint: { type: "loading" | "error"; text: string } = $state({ type: "loading", text: "" });

	function parseURL() {
		const url = new URL(window.location.href);
		const roomId = url.searchParams.get("room");
		const implementation = url.searchParams.get("implementation");
		return { roomId, implementation };
	}

	async function createClientFromURL() {
		const { roomId, implementation } = parseURL();

		if (!roomId) {
			hint = { type: "error", text: "Missing `room` URL parameter." };
			return undefined;
		}

		hint = { type: "loading", text: "Waiting for signal server handshake..." };
		if (implementation === "webrtc") {
			return await ChatRoomClient.createWebRTC(roomId);
		} else if (implementation === "websocket") {
			hint = { type: "loading", text: "Waiting for websocket handshake..." };
			return await ChatRoomClient.createWebsocket(roomId);
		} else if (implementation === "local") {
			return ChatRoomClient.createLocal(roomId);
		} else {
			hint = { type: "error", text: `Invalid implementation: \`${implementation}\`` };
			return undefined;
		}
	}

	let chatClient = $state<Awaited<ReturnType<typeof createClientFromURL>> | undefined>(undefined);
	window.addEventListener('beforeunload', () => chatClient?.dataChannel[Symbol.dispose]());

	async function loadClientFromURL() {
		chatClient?.dataChannel[Symbol.dispose]();
		
		chatClient = await createClientFromURL();
		if (!chatClient) return;

		chatClient.dataChannel.onMessage.addListener((packet) => {
			messages.push(packet);
		});

		document.title = `Chat - ${nameFromUUID(chatClient.myId)}`;
		setFavicon(await generateFavicon(chatClient.myId));
	}

	loadClientFromURL();


	let currentTime = $state(Date.now());
	setInterval(() => currentTime = Date.now());
	const updatePeriodically = <T>(value: T) => {
		currentTime; // update periodically
		return value;
	};
</script>
<div class="fixed inset-0 flex h-full items-stretch">
	<div class="flex-1">
		{#if parseURL().implementation === null}
			{@const links = [
				{ implementation: "webrtc", label: "WebRTC" },
				{ impl: "websocket", label: "WebSocket" },
				{ impl: "local", label: "Local" },
			]}
			<div class="flex flex-col items-center justify-center h-full">
				<h2 class="text-2xl font-bold mb-5">Select Chat Implementation</h2>
				<div class="flex flex-col items-center gap-3">
					{#each links as { implementation, label }}
						<a
							href={`?implementation=${implementation}&room=default`}
							class="
								px-4 py-2
								rounded
								bg-primary-500 text-onPrimary
								hover:bg-primary-600 active:bg-primary-700
								transition
							"
						>
							{label}
						</a>
					{/each}
				</div>
			</div>
		{/if}
		{#if chatClient}
			<Chat
				className="h-full"
				myId={chatClient.myId}
				messages={messages}
				onSendMessage={(text) => {
					if (!chatClient) return;

					const packet = { type: "message", content: text } as ChatRoom.OutboundPacket;
					chatClient.dataChannel.send(packet);
					messages.push({ user: chatClient.myId, ...packet });
				}}
			/>
		{:else}
			<div class="flex flex-col items-center justify-center h-full">
				<div class="
					flex items-center justify-center text-xl gap-5
					{hint.type === 'error' ? 'text-onSurface' : 'text-onSurface/30'}
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
					<Markdown markdown={hint.text} />
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
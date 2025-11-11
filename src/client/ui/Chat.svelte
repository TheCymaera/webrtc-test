
<script lang="ts">
	import type { ChatRoom } from "../chatRoom/ChatRoomPackets.js";
	import { fa5_solid_paperPlane } from "fontawesome-svgs";
	import { nameFromUUID } from "./utilities.js";
	import Avatar from "./Avatar.svelte";
	import Markdown from './Markdown.svelte';

	interface Props {
		className?: string;
		myId: string;
		messages: Array<ChatRoom.ClientBoundPacket>;
		onSendMessage: (text: string) => void;
	}

	let { className, myId, messages, onSendMessage }: Props = $props();

	const offlineUsers = $derived.by(() => {
		const out = new Set<string>();
		for (const message of messages) {
			if (message.type === "leave") {
				out.add(message.user);
			} else {
				out.delete(message.user);
			}
		}
		return out;
	});

	let scrollContainer: HTMLDivElement;
	$effect(() => {
		[...messages];
		scrollContainer.scrollTop = scrollContainer.scrollHeight;
	});

	let inputMessage = $state("");
</script>
<div class="grid grid-rows-[1fr_min-content] {className}">
	<!-- Messages -->
	<div class="overflow-y-auto" bind:this={scrollContainer}>
		<div class="max-w-300 m-auto">
			{#each messages as message, index (index)}
				{@const lastMessage = messages[index - 1]}
				{@const nextMessage = messages[index + 1]}
				{@const firstOfType = !lastMessage || lastMessage.user !== message.user || lastMessage.type !== message.type}
				{@const lastOfType = !nextMessage || nextMessage.user !== message.user || nextMessage.type !== message.type}
				{@render messageItem(message, firstOfType, lastOfType)}
			{/each}
		</div>
	</div>

	<!-- Input -->
	<form class="p-5 grid place-items-center" onsubmit={(event)=>{
		event.preventDefault();
		const message = inputMessage.trim();
		if (!message) return;
		onSendMessage(message);
		inputMessage = '';
	}}>
		<div class="relative max-w-300 w-full">
			<textarea 
				bind:value={inputMessage} 
				placeholder={"Enter your message here..."}  
				class="
					w-full rounded-md
					outline-[3px] outline-offset-[-3px]
					outline-transparent 
					focus-visible:outline-primary-500
					transition-colors
					disabled:opacity-50
					resize-none

					bg-surfaceContainer border-none py-4 px-8
				"
				rows={inputMessage.split("\n").length || 1}
				onkeydown={(event)=>{
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						const message = inputMessage.trim();
						if (!message) return;
						onSendMessage(message);
						inputMessage = '';
					}
				}}
			></textarea>

			<div class="absolute right-5 bottom-[15px]">
				{@render submitButton()}
			</div>
		</div>
	</form>
</div>


{#snippet messageItem(message: ChatRoom.ClientBoundPacket, firstOfType: boolean, lastOfType: boolean)}
	{@const isOffline = offlineUsers.has(message.user)}
	{@const isMe = message.user === myId}
	<div class="
		relative
		px-3 py-[0.05px]
		{isOffline ? "opacity-50" : ""}
		hover:bg-onSurface/3 transition-colors
	">
		<div class="absolute top-3 left-3 w-10 h-10" hidden={!firstOfType}>
			<Avatar userId={message.user} />
		</div>	

		<div class="ml-15">
			<!-- Username -->
			<div class="flex items-center gap-2 mt-3" hidden={!firstOfType}>
				<span class="font-bold">
					{nameFromUUID(message.user)}
				</span>
				{#if isMe}
					<span class="border-l border-l-divider h-4"></span>
					<span class="font-bold text-yellow-500 text-sm">You</span>
				{/if}
			</div>

			<!-- Message Content -->
			<div class="my-2">
				{#if message.type === "message"}
					<Markdown markdown={message.content} />
				{:else if message.type === "join"}
					joined the chat.
				{:else if message.type === "leave"}
					left the chat.
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet submitButton()}
	<button 
		type="submit"
		class="
			rounded-full flex items-center justify-center
			w-10 h-10
			bg-primary-600 hover:bg-primary-700 active:bg-primary-800
			disabled:bg-onSurface/50
			text-onPrimary
			transition-colors
			not-disabled:cursor-pointer
		"
	>
		{@html fa5_solid_paperPlane}
	</button>
{/snippet}
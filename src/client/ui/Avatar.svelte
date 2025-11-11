<script lang="ts">
	import { fa5_solid_user } from "fontawesome-svgs";
	import { colorFromUUID } from "./utilities.js";
	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();
	const color = $derived(colorFromUUID(userId));
</script>
<div style="background-color: {color};" class="rounded-full flex items-center justify-center w-full h-full text-white">
	{@html fa5_solid_user}
</div>
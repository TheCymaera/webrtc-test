<script lang="ts" module>
	import { Marked } from 'marked';
	import { markedHighlight } from "marked-highlight";
	import hljs from "highlight.js";
	import "highlight.js/styles/github-dark.css";
	import DOMPurify from 'dompurify';
	const marked = new Marked(
		markedHighlight({
			emptyLangClass: 'hljs',
			langPrefix: 'hljs language-',
			highlight(code, lang, info) {
				const language = hljs.getLanguage(lang) ? lang : 'plaintext';
				return hljs.highlight(code, { language }).value;
			}
		})
	);
</script>
<script lang="ts">
	interface Props {
		markdown: string;
	}

	let { markdown }: Props = $props();
</script>
<div class="markdown-content">
	{@html DOMPurify.sanitize(marked.parse(markdown) as string)}
</div>
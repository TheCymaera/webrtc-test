import * as vite from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default vite.defineConfig({
	plugins: [
		tailwindcss(),
		svelte({
			configFile: path.resolve(__dirname, "svelte.config.js"),
		}),
	],
	// Route API requests
	server: {
		host: true,
		proxy: {
			'/api/relay': {
				target: 'http://127.0.0.1:3000',
				changeOrigin: true,
				secure: false,
				ws: true,
			}
		}
	},
});
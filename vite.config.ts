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
			'/api': {
				target: `http://127.0.0.1:${process.env.SERVER_PORT ?? 3000}`,
				secure: false,
				ws: true,
			}
		}
	},
});
import { COTURN_PORT, COTURN_PUBLIC_IP, COTURN_SECRET, TURN_TTL_SEC } from "./env.js";

export async function iceEndpoint(_server: Bun.Server<unknown>, _request: Request): Promise<Response> {
	const iceServers: RTCIceServer[] = [
		{ urls: [`stun:${COTURN_PUBLIC_IP}:${COTURN_PORT}`] },
		await generateTimeLimitedTurnCredentials("webrtc", TURN_TTL_SEC)
	];

	return new Response(JSON.stringify({ iceServers }), {
		headers: {
			"content-type": "application/json",
		},
	});
}

async function generateTimeLimitedTurnCredentials(userHint: string, ttlSec: number) {
	const expiry = Math.floor(Date.now() / 1000) + Math.max(60, Math.min(24 * 3600, ttlSec));
	const username = `${expiry}:${userHint}`;

	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(COTURN_SECRET),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(username));
	const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
	
	return { urls: [`turn:${COTURN_PUBLIC_IP}:${COTURN_PORT}`], username, credential: b64 };
}
import { fa5_solid_user } from "fontawesome-svgs";
import { adjectives, animals } from "./wordList.js";

function stringHash(str: string) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

export function colorFromUUID(uuid: string) {
	const hash = stringHash(uuid);
	const r = (hash & 0xFF0000) >> 16;
	const g = (hash & 0x00FF00) >> 8;
	const b = (hash & 0x0000FF);
	return `rgb(${r}, ${g}, ${b})`;
}

export function nameFromUUID(uuid: string) {
	const hash = stringHash(uuid);

	const random1 = (hash % 1000) / 1000;
	const random2 = ((Math.floor(hash / 1000)) % 1000) / 1000;

	const adjective = adjectives[Math.floor(random1 * adjectives.length)];
	const animal = animals[Math.floor(random2 * animals.length)];

	return `${adjective} ${animal}`;
}

export async function generateFavicon(id: string) {
	const color = colorFromUUID(id);

	const canvas = document.createElement("canvas");
	canvas.width = 16;
	canvas.height = 16;
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = color;

	// draw circle
	ctx.beginPath();
	ctx.arc(8, 8, 8, 0, Math.PI * 2);
	ctx.fill();


	// draw user svg
	const svg = fa5_solid_user.replace("currentColor", "#ffffff");
	const dataUrl = 'data:image/svg+xml;base64,' + btoa(svg);
	
	const img = new Image();
	img.src = dataUrl;
	await new Promise((resolve) => { img.onload = resolve; });

	const height = 9;
	const width = height * (img.width / img.height);
	ctx.drawImage(img, 8 - width / 2, 8 - height / 2, width, height);

	return canvas.toDataURL("image/png");
}

export function setFavicon(dataUrl: string) {
	let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
	if (!link) {
		link = document.createElement("link");
		link.rel = "icon";
		document.head.appendChild(link);
	}
	link.href = dataUrl;
}
export const SERVER_PORT = numberEnv("SERVER_PORT");
export const TURN_TTL_SEC = numberEnv("TURN_TTL_SEC");

export const COTURN_PUBLIC_IP = stringEnv("COTURN_PUBLIC_IP");
export const COTURN_SECRET = stringEnv("COTURN_SECRET");
export const COTURN_PORT = numberEnv("COTURN_PORT");



function stringEnv(key: string, fallback?: string) {
	const value = Bun.env[key] ?? fallback;
	if (value === undefined) {
		throw new Error(`Required environment variable ${key} is not set!`);
	}
	return value;
}

function numberEnv(key: string, fallback?: number) {
	const unparsed = Bun.env[key];
	if (unparsed === undefined) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Required environment variable ${key} is not set!`);
	}

	const parsed = Number(unparsed);
	if (isNaN(parsed)) throw new Error(`Required environment variable ${key} is not a valid number!`);
	return parsed;
}
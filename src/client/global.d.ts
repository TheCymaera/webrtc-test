import "vite/client";
/// <reference types="svelte" />

declare global {
	interface ObjectConstructor {
		entries<T>(o: T): [keyof T, T[keyof T]][];
	}
}


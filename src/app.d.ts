// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { DefaultSession, Session } from '@auth/sveltekit';

declare module '@auth/sveltekit' {
	interface Session {
		user?: DefaultSession['user'] & {
			id?: string;
		};
	}
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			session?: Session | null;
			scenarioCount?: number;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

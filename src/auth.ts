import { SvelteKitAuth } from '@auth/sveltekit';
import type { RequestEvent } from '@sveltejs/kit';
import Auth0 from '@auth/sveltekit/providers/auth0';
import { env } from '$env/dynamic/private';

function getRequiredEnv(primaryKey: string, fallbackKey?: string): string {
	const value = env[primaryKey] ?? (fallbackKey ? env[fallbackKey] : undefined);
	if (!value) {
		throw new Error(
			`Missing required environment variable: ${primaryKey}${fallbackKey ? ` (or ${fallbackKey})` : ''}`
		);
	}
	return value;
}

const auth = SvelteKitAuth({
	providers: [
		Auth0({
			clientId: getRequiredEnv('AUTH_AUTH0_ID', 'AUTH0_ID'),
			clientSecret: getRequiredEnv('AUTH_AUTH0_SECRET', 'AUTH0_SECRET'),
			issuer: getRequiredEnv('AUTH_AUTH0_ISSUER', 'AUTH0_ISSUER')
		})
	],
	trustHost: true
});

export const { handle, signIn, signOut } = auth;

export async function signInWithAuth0(event: RequestEvent, redirectTo?: string) {
	const formData = new FormData();
	formData.set('providerId', 'auth0');

	if (redirectTo) {
		formData.set('redirectTo', redirectTo);
	}

	const request = new Request(event.request.url, {
		method: 'POST',
		headers: new Headers(event.request.headers),
		body: new URLSearchParams(Array.from(formData.entries()) as [string, string][])
	});

	await signIn({ ...event, request });
}

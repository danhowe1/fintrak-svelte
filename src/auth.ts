import { SvelteKitAuth } from '@auth/sveltekit';
import type { RequestEvent } from '@sveltejs/kit';
import { getAuthProviderId, createAuthProvider } from '$lib/server/auth-config';

const auth = SvelteKitAuth({
	providers: [createAuthProvider()],
	trustHost: true,
	callbacks: {
		session: async ({ session, token }) => {
			if (token.sub && session.user) {
				session.user.id = token.sub;
			}

			return session;
		}
	}
});

export const { handle, signIn, signOut } = auth;

export async function signInWithAuth0(event: RequestEvent, redirectTo?: string) {
	const formData = new FormData();
	formData.set('providerId', getAuthProviderId());

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

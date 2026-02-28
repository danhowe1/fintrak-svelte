import type { RequestHandler } from './$types';
import { DEFAULT_AUTHENTICATED_REDIRECT } from '$lib/auth';
import { signInWithAuth0 } from '../../auth';

export const GET: RequestHandler = async (event) => {
	const callbackUrl = event.url.searchParams.get('callbackUrl') ?? DEFAULT_AUTHENTICATED_REDIRECT;
	await signInWithAuth0(event, callbackUrl);
	return new Response(null, { status: 204 });
};

import type { RequestHandler } from './$types';
import { signInWithAuth0 } from '../../auth';

export const GET: RequestHandler = async (event) => {
	const callbackUrl = event.url.searchParams.get('callbackUrl') ?? '/dashboard';
	await signInWithAuth0(event, callbackUrl);
	return new Response(null, { status: 204 });
};

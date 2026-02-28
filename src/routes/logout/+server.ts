import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProviderLogoutUrl } from '$lib/server/auth-config';
import { signOut } from '../../auth';

export const GET: RequestHandler = async ({ url }) => {
	const providerLogoutUrl = getProviderLogoutUrl(url.origin);

	if (!providerLogoutUrl) {
		throw redirect(303, '/');
	}

	throw redirect(303, providerLogoutUrl.toString());
};

export const POST: RequestHandler = async (event) => {
	await signOut(event);
	return new Response(null, { status: 204 });
};

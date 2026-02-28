import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { signOut } from '../../auth';

function getEnv(primaryKey: string, fallbackKey?: string): string | undefined {
	return env[primaryKey] ?? (fallbackKey ? env[fallbackKey] : undefined);
}

export const GET: RequestHandler = async ({ url }) => {
	const issuer = getEnv('AUTH_AUTH0_ISSUER', 'AUTH0_ISSUER');
	const clientId = getEnv('AUTH_AUTH0_ID', 'AUTH0_ID');

	if (!issuer || !clientId) {
		throw redirect(303, '/');
	}

	const returnTo = `${url.origin}/`;
	const auth0LogoutUrl = new URL('/v2/logout', issuer);
	auth0LogoutUrl.searchParams.set('client_id', clientId);
	auth0LogoutUrl.searchParams.set('returnTo', returnTo);

	throw redirect(303, auth0LogoutUrl.toString());
};

export const POST: RequestHandler = async (event) => {
	await signOut(event);
	return new Response(null, { status: 204 });
};

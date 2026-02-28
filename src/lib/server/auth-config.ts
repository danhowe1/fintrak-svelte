import Auth0 from '@auth/sveltekit/providers/auth0';
import { env } from '$env/dynamic/private';
import { AUTH_PROVIDER_ID } from '$lib/auth';

function getRequiredEnv(primaryKey: string, fallbackKey?: string): string {
	const value = env[primaryKey] ?? (fallbackKey ? env[fallbackKey] : undefined);

	if (!value) {
		throw new Error(
			`Missing required environment variable: ${primaryKey}${fallbackKey ? ` (or ${fallbackKey})` : ''}`
		);
	}

	return value;
}

function getOptionalEnv(primaryKey: string, fallbackKey?: string): string | undefined {
	return env[primaryKey] ?? (fallbackKey ? env[fallbackKey] : undefined);
}

export function getAuthProviderId() {
	return AUTH_PROVIDER_ID;
}

export function createAuthProvider() {
	return Auth0({
		clientId: getRequiredEnv('AUTH_AUTH0_ID', 'AUTH0_ID'),
		clientSecret: getRequiredEnv('AUTH_AUTH0_SECRET', 'AUTH0_SECRET'),
		issuer: getRequiredEnv('AUTH_AUTH0_ISSUER', 'AUTH0_ISSUER')
	});
}

export function getProviderLogoutUrl(origin: string) {
	const issuer = getOptionalEnv('AUTH_AUTH0_ISSUER', 'AUTH0_ISSUER');
	const clientId = getOptionalEnv('AUTH_AUTH0_ID', 'AUTH0_ID');

	if (!issuer || !clientId) {
		return null;
	}

	const providerLogoutUrl = new URL('/v2/logout', issuer);
	providerLogoutUrl.searchParams.set('client_id', clientId);
	providerLogoutUrl.searchParams.set('returnTo', `${origin}/`);

	return providerLogoutUrl;
}

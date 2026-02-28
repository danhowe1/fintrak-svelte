import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authenticationHandle } from './auth';

const PUBLIC_PATHS = new Set(['/', '/robots.txt', '/favicon.svg', '/login', '/logout']);
const PUBLIC_PREFIXES = ['/auth', '/_app'];

const authorizationHandle: Handle = async ({ event, resolve }) => {
	const getSession = event.locals.auth;
	let sessionPromise: ReturnType<typeof getSession> | undefined;

	event.locals.auth = () => {
		sessionPromise ??= getSession();
		return sessionPromise;
	};

	const path = event.url.pathname;
	const isPublicPath = PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

	if (isPublicPath) {
		return resolve(event);
	}

	const session = await event.locals.auth();

	if (!session) {
		const callbackUrl = encodeURIComponent(`${path}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	return resolve(event);
};

export const handle: Handle = sequence(authenticationHandle, authorizationHandle);

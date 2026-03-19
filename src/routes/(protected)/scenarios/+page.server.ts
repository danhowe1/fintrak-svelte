import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuthenticatedUserId, getScenariosForUser } from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	const userId = getAuthenticatedUserId(session);
	const scenarios = await getScenariosForUser(userId);

	return {
		scenarios
	};
};

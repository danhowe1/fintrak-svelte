import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countScenariosForUser, getAuthenticatedUserId } from '$lib/server/database';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();

	if (!session) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	const userId = getAuthenticatedUserId(session);
	const scenarioCount = await countScenariosForUser(userId);

	if (scenarioCount === 0 && event.url.pathname !== '/scenarios/create') {
		throw redirect(303, '/scenarios/create');
	}

	return {
		scenarioCount
	};
};

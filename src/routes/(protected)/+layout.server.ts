import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countScenariosForUser } from '$lib/server/database';

export const load: LayoutServerLoad = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarioCount = await countScenariosForUser(userId);

	const path = event.url.pathname;

	if (scenarioCount === 0 && path !== '/scenarios/create') {
		throw redirect(303, '/scenarios/create');
	}

	return {
		scenarioCount
	};
};

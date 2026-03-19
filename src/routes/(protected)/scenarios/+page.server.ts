import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getScenariosForUser } from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarios = await getScenariosForUser(userId);

	return {
		scenarios
	};
};


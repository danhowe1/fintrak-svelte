import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSingleScenarioForUser } from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const { scenarioCount } = await event.parent();

	if (scenarioCount === 0) {
		throw redirect(303, '/scenarios/create');
	}

	if (scenarioCount > 1) {
		throw redirect(303, '/scenarios');
	}

	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenario = await getSingleScenarioForUser(userId);

	if (scenario) {
		event.cookies.set('currentScenarioId', scenario.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
		throw redirect(303, '/dashboard');
	}

	throw redirect(303, '/scenarios');
};

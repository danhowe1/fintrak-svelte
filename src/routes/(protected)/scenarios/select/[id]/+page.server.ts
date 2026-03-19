import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuthenticatedUserId, getScenarioForUserById } from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	const userId = getAuthenticatedUserId(session);
	const scenario = await getScenarioForUserById(userId, event.params.id);

	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	event.cookies.set('currentScenarioId', scenario.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax'
	});

	throw redirect(303, `/dashboard?scenarioId=${scenario.id}`);
};

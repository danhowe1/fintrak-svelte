import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAccountsForScenario, getScenarioForUserById } from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarioId = event.cookies.get('currentScenarioId');
	if (!scenarioId) {
		throw redirect(303, '/scenarios');
	}

	const scenario = await getScenarioForUserById(userId, scenarioId);
	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	const accounts = await getAccountsForScenario(scenario.id);

	return {
		scenario,
		accounts
	};
};

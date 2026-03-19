import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getCashflowsForScenario,
	getScenarioForUserById,
	getSingleScenarioForUser
} from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const scenario = scenarioId
		? await getScenarioForUserById(userId, scenarioId)
		: await getSingleScenarioForUser(userId);

	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	const currentScenarioId = event.cookies.get('currentScenarioId');
	const scenarioToStore = scenarioId ?? scenario.id;

	if (scenarioToStore && scenarioToStore !== currentScenarioId) {
		event.cookies.set('currentScenarioId', scenarioToStore, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}

	const cashflows = await getCashflowsForScenario(scenario.id);

	return {
		scenario,
		cashflows
	};
};


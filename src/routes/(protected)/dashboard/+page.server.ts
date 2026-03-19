import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getAuthenticatedUserId,
	getCashflowsForScenario,
	getScenarioForUserById,
	getSingleScenarioForUser
} from '$lib/server/database';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	const userId = getAuthenticatedUserId(session);
	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const scenario = scenarioId
		? await getScenarioForUserById(userId, scenarioId)
		: await getSingleScenarioForUser(userId);

	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	if (scenarioId && scenarioId !== event.cookies.get('currentScenarioId')) {
		event.cookies.set('currentScenarioId', scenarioId, {
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

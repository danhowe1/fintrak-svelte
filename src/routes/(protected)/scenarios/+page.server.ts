import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	deleteScenarioForOwner,
	getScenariosForUser,
	getSingleScenarioForUser
} from '$lib/server/database';

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

export const actions: Actions = {
	delete: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}

		const formData = await event.request.formData();
		const scenarioId = formData.get('scenarioId');
		if (typeof scenarioId !== 'string' || scenarioId.trim() === '') {
			return fail(400, { error: 'Scenario id is required.' });
		}

		const deletedScenario = await deleteScenarioForOwner(userId, scenarioId);
		if (!deletedScenario) {
			return fail(403, { error: 'Only the scenario owner can delete this scenario.' });
		}

		const currentScenarioId = event.cookies.get('currentScenarioId');
		if (currentScenarioId === scenarioId) {
			const nextScenario = await getSingleScenarioForUser(userId);
			if (nextScenario) {
				event.cookies.set('currentScenarioId', nextScenario.id, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax'
				});
			} else {
				event.cookies.delete('currentScenarioId', { path: '/' });
			}
		}

		const remainingScenario = await getSingleScenarioForUser(userId);
		throw redirect(303, remainingScenario ? '/scenarios' : '/scenarios/create');
	}
};

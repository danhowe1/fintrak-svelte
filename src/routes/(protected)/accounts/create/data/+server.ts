import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAssetsForScenario, getScenarioForUserById } from '$lib/server/database';

export const GET: RequestHandler = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent('/accounts/create');
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	const scenarioId = event.cookies.get('currentScenarioId');
	if (!scenarioId) {
		return json({ message: 'No active scenario selected.' }, { status: 400 });
	}

	const scenario = await getScenarioForUserById(userId, scenarioId);
	if (!scenario) {
		return json({ message: 'Scenario not found.' }, { status: 404 });
	}

	const assets = await getAssetsForScenario(scenario.id);
	const people = assets
		.filter((asset) => asset.asset_type === 'person')
		.map((person) => ({ id: person.id, name: person.name }));

	return json({
		scenario: { id: scenario.id, name: scenario.name },
		people
	});
};

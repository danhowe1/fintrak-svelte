import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectionBundleForUser } from '$lib/server/database';
import { parseProjectionRange, parseRateCookie } from '$lib/server/dashboard-context';
import { buildDashboardProjectionResponse } from '$lib/server/dashboard-projection-response';

export const GET: RequestHandler = async (event) => {
	const userId = event.locals.appUserId;
	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
	const { scenario } = projectionBundle;

	if (!scenario) {
		return json({ error: 'Scenario not found' }, { status: 404 });
	}

	const projectionRange = parseProjectionRange(event.cookies.get('projectionRange'));
	const inflationRate = parseRateCookie(event.cookies.get('inflationRate'), 2.0);
	const includeCashflows = event.url.searchParams.get('includeCashflows') === 'true';
	const response = buildDashboardProjectionResponse({
		projectionBundle,
		inflationRate,
		projectionRange,
		includeCashflows
	});

	return json(response);
};

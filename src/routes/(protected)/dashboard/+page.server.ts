import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getCashflowsForScenario,
	getAccountsForScenario,
	getAssetsForScenario,
	getAssetAccountsForScenario,
	getScenarioForUserById,
	getSingleScenarioForUser
} from '$lib/server/database';
import { buildProjection } from '$lib/server/projection';

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
	const [accounts, assets, assetAccounts] = await Promise.all([
		getAccountsForScenario(scenario.id),
		getAssetsForScenario(scenario.id),
		getAssetAccountsForScenario(scenario.id)
	]);

	const projectionRangeParam = event.url.searchParams.get('projectionRange') ?? 'all';
	const projectionRange =
		projectionRangeParam === '1y' ||
		projectionRangeParam === '5y' ||
		projectionRangeParam === '10y' ||
		projectionRangeParam === 'all'
			? projectionRangeParam
			: 'all';
	const projectionMonths =
		projectionRange === '1y'
			? 12
			: projectionRange === '5y'
				? 60
				: projectionRange === '10y'
					? 120
					: null;

	const projection = buildProjection({
		scenarioStartDate: scenario.details?.startDate,
		inflationRate: scenario.details?.inflationRate,
		maxMonths: projectionMonths,
		cashflows,
		accounts,
		assets,
		assetAccounts
	});

	return {
		scenario,
		cashflows,
		projection,
		projectionRange
	};
};

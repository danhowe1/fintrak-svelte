import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAccountsForScenario,
	getAssetAccountsForScenario,
	getAssetsForScenario,
	getCashflowsForScenario,
	getScenarioForUserById,
	getSingleScenarioForUser
} from '$lib/server/database';
import { buildProjection } from '$lib/server/projection';

const parseRate = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseProjectionRange = (value: string | undefined) => {
	if (value === '1y' || value === '5y' || value === '10y' || value === 'all') {
		return value;
	}
	return 'all';
};

const projectionMonthsForRange = (range: string) => {
	switch (range) {
		case '1y':
			return 12;
		case '5y':
			return 60;
		case '10y':
			return 120;
		default:
			return null;
	}
};

export const GET: RequestHandler = async (event) => {
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
		return json({ error: 'Scenario not found' }, { status: 404 });
	}

	const projectionRange = parseProjectionRange(event.cookies.get('projectionRange'));
	const projectionMonths = projectionMonthsForRange(projectionRange);
	const inflationRate = parseRate(event.cookies.get('inflationRate'), 2.0);
	const interestRateChange = parseRate(event.cookies.get('interestRateChange'), 0.0);

	const [cashflows, accounts, assets, assetAccounts] = await Promise.all([
		getCashflowsForScenario(scenario.id),
		getAccountsForScenario(scenario.id),
		getAssetsForScenario(scenario.id),
		getAssetAccountsForScenario(scenario.id)
	]);

	const projection = buildProjection({
		scenarioStartDate: scenario.details?.startDate,
		inflationRate,
		interestRateChange,
		maxMonths: projectionMonths,
		cashflows,
		accounts,
		assets,
		assetAccounts
	});

	return json({
		projection,
		projectionRange,
		sessionRates: {
			inflationRate,
			interestRateChange
		}
	});
};

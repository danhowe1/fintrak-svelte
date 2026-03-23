import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
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
	event.depends('projection');
	const parentData = await event.parent();
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

	const projectionRangeParam = event.url.searchParams.get('projectionRange');
	const projectionRangeCookie = event.cookies.get('projectionRange');
	const projectionRangeRaw = projectionRangeParam ?? projectionRangeCookie ?? 'all';
	const projectionRange =
		projectionRangeRaw === '1y' ||
		projectionRangeRaw === '5y' ||
		projectionRangeRaw === '10y' ||
		projectionRangeRaw === 'all'
			? projectionRangeRaw
			: 'all';

	if (projectionRangeParam && projectionRangeParam !== projectionRangeCookie) {
		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}

	if (!projectionRangeCookie && !projectionRangeParam) {
		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}
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
		inflationRate: parentData.sessionRates.inflationRate,
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
		projectionRange,
		sessionRates: parentData.sessionRates
	};
};

export const actions: Actions = {
	updateRates: async (event) => {
		const formData = await event.request.formData();
		const inflationRate = Number(formData.get('inflationRate'));
		const interestRateChange = Number(formData.get('interestRateChange'));
		const deltaInflation = Number(formData.get('deltaInflation') ?? 0);
		const deltaInterest = Number(formData.get('deltaInterest') ?? 0);

		const nextInflation = Number.isFinite(inflationRate)
			? Math.round((inflationRate + deltaInflation) * 10) / 10
			: 2.0;
		const nextInterest = Number.isFinite(interestRateChange)
			? Math.round((interestRateChange + deltaInterest) * 100) / 100
			: 0.0;

		event.cookies.set('inflationRate', nextInflation.toFixed(1), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
		event.cookies.set('interestRateChange', nextInterest.toFixed(2), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});

		return { success: true };
	},
	updateRange: async (event) => {
		const formData = await event.request.formData();
		const nextRange = String(formData.get('projectionRange') ?? 'all');
		const projectionRange =
			nextRange === '1y' || nextRange === '5y' || nextRange === '10y' || nextRange === 'all'
				? nextRange
				: 'all';

		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});

		return { success: true };
	}
};

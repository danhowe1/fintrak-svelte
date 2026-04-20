import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	type AccountBalanceTarget,
	type AccountListItem,
	type AssetAccountLink,
	type AssetListItem,
	type AutoFundingRule,
	type AutoSweepRule,
	type CashflowSummary,
	getProjectionBundleForUser
} from '$lib/server/database';
import {
	parseRateCookie,
	parseProjectionRange,
	syncCurrentScenarioCookie
} from '$lib/server/dashboard-context';
import { buildDashboardProjectionResponse } from '$lib/server/dashboard-projection-response';
import { formatYearMonthInput } from '$lib/yearMonth';
import { settingsActions } from './actions/settings';
import { fundingActions } from './actions/funding';
import { assetActions } from './actions/assets';
import { accountActions } from './actions/accounts';
import { cashflowActions } from './actions/cashflows';

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	const userId = event.locals.appUserId;
	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
	const { scenario } = projectionBundle;

	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	syncCurrentScenarioCookie(event, scenarioId ?? scenario.id);

	const projectionRangeParam = event.url.searchParams.get('projectionRange');
	const projectionRangeCookie = event.cookies.get('projectionRange');
	const projectionRange = parseProjectionRange(projectionRangeParam ?? projectionRangeCookie);

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

	const inflationRate = parseRateCookie(event.cookies.get('inflationRate'), 2.0);
	const projectionResponse = buildDashboardProjectionResponse({
		projectionBundle,
		inflationRate,
		projectionRange
	});
	const createStartDates = [
		...projectionBundle.assets,
		...projectionBundle.accounts,
		...projectionBundle.cashflows
	]
		.map((item) => item.start_date)
		.filter((value): value is number => Number.isFinite(value));

	return {
		scenario,
		cashflows: [] as CashflowSummary[],
		assets: [] as AssetListItem[],
		accounts: [] as AccountListItem[],
		assetAccounts: [] as AssetAccountLink[],
		autoFundingRules: [] as AutoFundingRule[],
		accountBalanceTargets: [] as AccountBalanceTarget[],
		autoSweepRules: [] as AutoSweepRule[],
		defaultCreateStartMonth:
			createStartDates.length > 0 ? formatYearMonthInput(Math.min(...createStartDates)) : '',
		projection: projectionResponse.projection,
		projectionRange,
		sessionRates: parentData.sessionRates
	};
};

export const actions: Actions = {
	...settingsActions,
	...fundingActions,
	...assetActions,
	...accountActions,
	...cashflowActions
};

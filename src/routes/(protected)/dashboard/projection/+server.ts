import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DashboardProjectionResponse } from '$lib/dashboard/contracts';
import {
	getAccountsForScenario,
	getAccountBalanceTargetsForScenario,
	getAutoFundingRulesForScenario,
	getAutoSweepRulesForScenario,
	getAssetAccountsForScenario,
	getAssetsForScenario,
	getCashflowsForScenario
} from '$lib/server/database';
import {
	parseProjectionRange,
	parseRateCookie,
	resolveDashboardScenario
} from '$lib/server/dashboard-context';
import { buildProjection } from '$lib/server/projection';

export const GET: RequestHandler = async (event) => {
	const { scenario } = await resolveDashboardScenario(event);

	if (!scenario) {
		return json({ error: 'Scenario not found' }, { status: 404 });
	}

	const projectionRange = parseProjectionRange(event.cookies.get('projectionRange'));
	const inflationRate = parseRateCookie(event.cookies.get('inflationRate'), 2.0);

	const [
		cashflows,
		accounts,
		assets,
		assetAccounts,
		autoFundingRules,
		accountBalanceTargets,
		autoSweepRules
	] = await Promise.all([
		getCashflowsForScenario(scenario.id),
		getAccountsForScenario(scenario.id),
		getAssetsForScenario(scenario.id),
		getAssetAccountsForScenario(scenario.id),
		getAutoFundingRulesForScenario(scenario.id),
		getAccountBalanceTargetsForScenario(scenario.id),
		getAutoSweepRulesForScenario(scenario.id)
	]);
	const includeCashflows = event.url.searchParams.get('includeCashflows') === 'true';

	const projection = buildProjection({
		inflationRate,
		projectionRange: 'all',
		maxMonths: null,
		cashflows,
		accounts,
		assets,
		assetAccounts,
		autoFundingRules,
		accountBalanceTargets,
		autoSweepRules
	});

	const response: DashboardProjectionResponse = {
		projection,
		autoFundingRules,
		accountBalanceTargets,
		autoSweepRules,
		...(includeCashflows ? { cashflows } : {}),
		projectionRange,
		sessionRates: {
			inflationRate
		}
	};

	return json(response);
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DashboardWhatIfResponse } from '$lib/dashboard/contracts';
import {
	getAccountsForScenario,
	getAccountBalanceTargetsForScenario,
	getAssetAccountsForScenario,
	getAssetsForScenario,
	getAutoFundingRulesForScenario,
	getAutoSweepRulesForScenario,
	getCashflowsForScenario
} from '$lib/server/database';
import { resolveDashboardScenario } from '$lib/server/dashboard-context';

export const GET: RequestHandler = async (event) => {
	const { scenario } = await resolveDashboardScenario(event);

	if (!scenario) {
		return json({ error: 'Scenario not found' }, { status: 404 });
	}

	const [accounts, assets, assetAccounts, cashflows, autoFundingRules, accountBalanceTargets, autoSweepRules] =
		await Promise.all([
			getAccountsForScenario(scenario.id),
			getAssetsForScenario(scenario.id),
			getAssetAccountsForScenario(scenario.id),
			getCashflowsForScenario(scenario.id),
			getAutoFundingRulesForScenario(scenario.id),
			getAccountBalanceTargetsForScenario(scenario.id),
			getAutoSweepRulesForScenario(scenario.id)
		]);

	const response: DashboardWhatIfResponse = {
		accounts,
		assets,
		assetAccounts,
		cashflows,
		autoFundingRules,
		accountBalanceTargets,
		autoSweepRules
	};

	return json(response);
};

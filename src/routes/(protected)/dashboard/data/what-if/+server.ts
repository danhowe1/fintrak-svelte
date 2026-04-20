import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DashboardWhatIfResponse } from '$lib/dashboard/contracts';
import { getProjectionBundleForUser } from '$lib/server/database';

export const GET: RequestHandler = async (event) => {
	const userId = event.locals.appUserId;

	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
	const { scenario } = projectionBundle;

	if (!scenario) {
		return json({ error: 'Scenario not found' }, { status: 404 });
	}

	const response: DashboardWhatIfResponse = {
		accounts: projectionBundle.accounts,
		assets: projectionBundle.assets,
		assetAccounts: projectionBundle.assetAccounts,
		cashflows: projectionBundle.cashflows,
		autoFundingRules: projectionBundle.autoFundingRules,
		accountBalanceTargets: projectionBundle.accountBalanceTargets,
		autoSweepRules: projectionBundle.autoSweepRules
	};

	return json(response);
};

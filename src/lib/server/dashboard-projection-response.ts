import type { ProjectionRangeValue } from '$lib/server/dashboard-context';
import type { DashboardProjectionResponse, DashboardReloadResponse } from '$lib/dashboard/contracts';
import type { ProjectionResult } from '$lib/server/projection';
import { buildProjection } from '$lib/server/projection';
import type { ProjectionScenarioBundle } from '$lib/server/database';

export const buildDashboardProjectionResponse = (input: {
	projectionBundle: ProjectionScenarioBundle;
	inflationRate: number;
	projectionRange: ProjectionRangeValue;
	includeCashflows?: boolean;
}): DashboardProjectionResponse & { projection: ProjectionResult } => {
	const { projectionBundle, inflationRate, projectionRange, includeCashflows = false } = input;
	const projection = buildProjection({
		inflationRate,
		projectionRange: 'all',
		maxMonths: null,
		cashflows: projectionBundle.cashflows,
		accounts: projectionBundle.accounts,
		assets: projectionBundle.assets,
		assetAccounts: projectionBundle.assetAccounts,
		autoFundingRules: projectionBundle.autoFundingRules,
		accountBalanceTargets: projectionBundle.accountBalanceTargets,
		autoSweepRules: projectionBundle.autoSweepRules
	});

	return {
		projection,
		autoFundingRules: projectionBundle.autoFundingRules,
		accountBalanceTargets: projectionBundle.accountBalanceTargets,
		autoSweepRules: projectionBundle.autoSweepRules,
		...(includeCashflows ? { cashflows: projectionBundle.cashflows } : {}),
		projectionRange,
		sessionRates: {
			inflationRate
		}
	};
};

export const buildDashboardReloadResponse = (input: {
	projectionBundle: ProjectionScenarioBundle;
	inflationRate: number;
	projectionRange: ProjectionRangeValue;
}): DashboardReloadResponse & { projection: ProjectionResult } => {
	const { projectionBundle } = input;
	const projectionResponse = buildDashboardProjectionResponse({
		...input,
		includeCashflows: true
	});

	return {
		accounts: projectionBundle.accounts,
		assets: projectionBundle.assets,
		assetAccounts: projectionBundle.assetAccounts,
		cashflows: projectionBundle.cashflows,
		...projectionResponse
	};
};

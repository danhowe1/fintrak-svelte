import { describe, expect, it } from 'vitest';
import {
	parseDashboardProjectionResponse,
	parseDashboardWhatIfResponse
} from '../src/lib/dashboard/contracts';

describe('dashboard contracts', () => {
	it('parses valid what-if payloads', () => {
		const parsed = parseDashboardWhatIfResponse({
			accounts: [],
			assets: [],
			assetAccounts: [],
			cashflows: [],
			autoFundingRules: [],
			accountBalanceTargets: [],
			autoSweepRules: []
		});

		expect(parsed).toEqual({
			accounts: [],
			assets: [],
			assetAccounts: [],
			cashflows: [],
			autoFundingRules: [],
			accountBalanceTargets: [],
			autoSweepRules: []
		});
	});

	it('rejects invalid projection payloads', () => {
		expect(() =>
			parseDashboardProjectionResponse({
				projection: {
					startDate: 202601,
					endDate: 203001,
					transactions: [],
					accounts: [],
					assets: [],
					liquidity: { series: [], points: [] },
					planner: {},
					events: []
				},
				autoFundingRules: [],
				accountBalanceTargets: [],
				autoSweepRules: [],
				projectionRange: 'all',
				sessionRates: { inflationRate: '2.0' }
			})
		).toThrow();
	});

	it('parses valid projection payloads', () => {
		const parsed = parseDashboardProjectionResponse({
			projection: {
				startDate: 202601,
				endDate: 203001,
				transactions: [],
				accounts: [],
				assets: [],
				liquidity: { series: [], points: [] },
				planner: {},
				events: []
			},
			autoFundingRules: [],
			accountBalanceTargets: [],
			autoSweepRules: [],
			projectionRange: 'all',
			sessionRates: { inflationRate: 2.0 }
		});

		expect(parsed.sessionRates.inflationRate).toBe(2.0);
		expect(parsed.projectionRange).toBe('all');
	});
});

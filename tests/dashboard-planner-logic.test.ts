import { describe, expect, it } from 'vitest';
import {
	calculateStage3Assessment,
	findStage2RunOutEvent,
	getPlannerLiquiditySaleShortcut,
	getPlannerSourceAvailabilityWarning,
	getPlannerSourceOptions,
	getStage2AllocationShortfall
} from '../src/lib/dashboard/planner-logic';

describe('dashboard planner logic helpers', () => {
	it('finds stage 2 run-out events', () => {
		const event = findStage2RunOutEvent([
			{ tone: 'info', message: 'All good.' },
			{ tone: 'negative', message: 'Offset account runs out of money.', monthLabel: 'Jan 2034' }
		]);
		expect(event?.monthLabel).toBe('Jan 2034');
	});

	it('calculates stage 3 assessment from projection/account inputs', () => {
		const assessment = calculateStage3Assessment({
			stage3Reached: true,
			projectionData: {
				startDate: 203001,
				transactions: [
					{ cashflowType: 'expense', category: 'living_expenses', date: 203001, amount: -3000 },
					{ cashflowType: 'expense', category: 'mortgage_repayment', date: 203002, amount: -2000 }
				],
				accounts: [{ accountId: 'cash-1', points: [{ balance: 25000 }] }],
				assets: [{ assetType: 'shares', points: [{ value: 50000 }] }],
				liquidity: {
					points: [
						{ date: 203001, balance: 100000 },
						{ date: 203002, balance: 90000 },
						{ date: 203003, balance: 85000 },
						{ date: 203004, balance: 92000 }
					]
				}
			},
			accounts: [{ id: 'cash-1', account_type: 'cash_account' }],
			assetAccounts: [],
			accountBalanceTargets: [{ account_id: 'cash-1', enabled: true, min_balance: 5000 }]
		});

		expect(assessment).not.toBeNull();
		expect(assessment?.safetyScore).toBeGreaterThan(0);
		expect(assessment?.growthScore).toBeGreaterThan(0);
		expect(assessment?.profile).toMatch(/Conservative|Balanced|Growth/);
	});

	it('derives source options from shortfall and existing rules', () => {
		const shortfall = getStage2AllocationShortfall({
			minBalance: -100,
			targetAccountId: 'target-1',
			targetAccountName: 'Target',
			availableSourceAccounts: [
				{ accountId: 'src-2', accountName: 'Zeta', availableNow: true },
				{ accountId: 'src-1', accountName: 'Alpha', availableNow: false, availableFromDate: 203004 },
				{ accountId: 'target-1', accountName: 'Target', availableNow: true }
			]
		});
		const options = getPlannerSourceOptions(shortfall, [{ source_account_id: 'src-2' }]);

		expect(options).toEqual([
			{
				id: 'src-1',
				name: 'Alpha',
				availableNow: false,
				availableFromDate: 203004
			}
		]);
		expect(
			getPlannerSourceAvailabilityWarning(options[0], (value) => `M${value.toString()}`)
		).toContain('M203004');
	});

	it('builds a liquidity sale shortcut from best available source', () => {
		const shortcut = getPlannerLiquiditySaleShortcut({
			firstLiquidityDeficit: { startDate: 203006, deficitAmount: 1200 },
			plannerFirstShortfall: { targetAccountId: 'cash-main' },
			accounts: [
				{ id: 'cash-main', name: 'Main cash', account_type: 'cash_account' },
				{ id: 'broker-1', name: 'Brokerage', account_type: 'brokerage' }
			],
			assets: [{ id: 'asset-shares', asset_type: 'shares' }],
			assetAccounts: [
				{ asset_id: 'asset-shares', account_id: 'broker-1', relationship_role: 'held_in' }
			],
			liquiditySeries: [{ id: 'asset:asset-shares', points: [{ date: 203006, balance: 5000 }] }]
		});

		expect(shortcut).not.toBeNull();
		expect(shortcut?.sourceAccountId).toBe('broker-1');
		expect(shortcut?.targetAccountId).toBe('cash-main');
		expect(shortcut?.amount).toBe(1200);
	});
});

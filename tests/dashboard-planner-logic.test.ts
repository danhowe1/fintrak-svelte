import { describe, expect, it } from 'vitest';
import {
	calculateStage3Assessment,
	findStage2RunOutEvent,
	getPlannerLiquiditySaleShortcut
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
			assets: [],
			accounts: [{ id: 'cash-1', account_type: 'cash_account' }],
			assetAccounts: []
		});

		expect(assessment).not.toBeNull();
		expect(assessment?.safetyScore).toBeGreaterThan(0);
		expect(assessment?.growthScore).toBeGreaterThan(0);
		expect(assessment?.profile).toMatch(/Conservative|Balanced|Growth/);
	});

	it('excludes primary residence property from growth allocation and includes investment property', () => {
		const assessment = calculateStage3Assessment({
			stage3Reached: true,
			projectionData: {
				startDate: 203001,
				transactions: [],
				accounts: [{ accountId: 'cash-1', points: [{ balance: 20000 }] }],
				assets: [
					{ assetId: 'property-home', assetType: 'property', points: [{ value: 500000 }] },
					{ assetId: 'property-investment', assetType: 'property', points: [{ value: 300000 }] }
				],
				liquidity: {
					points: [
						{ date: 203001, balance: 100000 },
						{ date: 203002, balance: 100000 }
					]
				}
			},
			assets: [
				{
					id: 'property-home',
					asset_type: 'property',
					details: { propertyUse: 'primary_residence' }
				},
				{
					id: 'property-investment',
					asset_type: 'property',
					details: { propertyUse: 'investment_property' }
				}
			],
			accounts: [{ id: 'cash-1', account_type: 'cash_account' }],
			assetAccounts: []
		});

		expect(assessment?.growthAllocationPct).toBe(93.8);
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

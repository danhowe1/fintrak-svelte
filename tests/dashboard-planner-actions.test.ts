import { describe, expect, it } from 'vitest';
import {
	buildLiquidityIncomeDraftPatch,
	buildLiquidityPropertySaleDetails,
	buildLiquidityTransferDraft,
	findBestLiquidityExpenseShortcut,
	findFirstPersonAssetId,
	findFirstPropertyAsset,
	PLANNER_LIQUIDITY_ERRORS
} from '../src/lib/dashboard/planner-actions';

describe('dashboard planner action helpers', () => {
	it('finds first person and property assets', () => {
		const assets = [
			{ id: 'a1', asset_type: 'shares' },
			{ id: 'a2', asset_type: 'person' },
			{ id: 'a3', asset_type: 'property' }
		] as any[];
		expect(findFirstPersonAssetId(assets as any)).toBe('a2');
		expect(findFirstPropertyAsset(assets as any)?.id).toBe('a3');
		expect(PLANNER_LIQUIDITY_ERRORS.missingSaleSource).toContain('shares/super');
	});

	it('builds income shortcut draft patch', () => {
		const patch = buildLiquidityIncomeDraftPatch({
			existing: {
				type: 'income',
				category: 'employment_income',
				frequency: 'monthly',
				amount: '100',
				description: '',
				startDate: '01 2030',
				endDate: '',
				inflationAffected: false,
				assetAccountId: 'acc-1'
			},
			firstLiquidityDeficit: { startDate: 203104, deficitAmount: 1234.567 },
			monthLabelFromDate: (value) => `M${value}`
		});
		expect(patch.category).toBe('misc_income');
		expect(patch.startDate).toBe('M203104');
		expect(patch.amount).toBe('1234.57');
		expect(patch.description).toBe('Liquidity support income');
	});

	it('finds best expense shortcut by highest amount', () => {
		const assets = [
			{ id: 'person-1', asset_type: 'person' },
			{ id: 'property-1', asset_type: 'property' }
		] as any[];
		const match = findBestLiquidityExpenseShortcut(assets as any, {
			'person-1': [
				{ id: 'c1', cashflow_type: 'expense', amount: 1000 },
				{ id: 'c2', cashflow_type: 'expense', amount: 2500 }
			],
			'property-1': [{ id: 'c3', cashflow_type: 'expense', amount: 1800 }]
		} as any);
		expect(match?.assetId).toBe('person-1');
		expect(match?.cashflow.id).toBe('c2');
	});

	it('builds transfer draft from liquidity sale shortcut', () => {
		const draft = buildLiquidityTransferDraft(
			{
				sourceAccountId: 'src-1',
				sourceAccountName: 'Broker',
				targetAccountId: 'dst-1',
				targetAccountName: 'Cash',
				startDate: 203011,
				amount: 900
			},
			(value) => `M${value}`
		);
		expect(draft.frequency).toBe('one_time');
		expect(draft.startDate).toBe('M203011');
		expect(draft.description).toContain('Cash');
	});

	it('builds property sale details using existing details when present', () => {
		const details = buildLiquidityPropertySaleDetails({
			property: { id: 'p1', name: 'Home', start_date: 202001, details: {}, asset_type: 'property' } as any,
			existing: {
				name: 'Home',
				startDate: '01 2020',
				marketValue: 100,
				marketGrowthRate: 2,
				saleDate: '',
				fixedSellingCosts: 1,
				variableSellingCosts: 2
			},
			firstLiquidityDeficit: { startDate: 203207 },
			monthLabelFromDate: (value) => `M${value}`,
			formatYearMonthInput: (value) => `F${value}`
		});
		expect(details.saleDate).toBe('M203207');
		expect(details.name).toBe('Home');
	});
});

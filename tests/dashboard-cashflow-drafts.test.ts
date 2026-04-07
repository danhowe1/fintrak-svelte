import { describe, expect, it } from 'vitest';
import {
	coerceDraftForAssetType,
	createDefaultCashflowDraft,
	createEditCashflowDraft,
	defaultCategoryForAssetType
} from '../src/lib/dashboard/cashflow-drafts';

describe('dashboard cashflow draft helpers', () => {
	it('selects default categories by asset type', () => {
		expect(defaultCategoryForAssetType('person', 'expense')).toBe('living_expenses');
		expect(defaultCategoryForAssetType('person', 'income')).toBe('employment_income');
		expect(defaultCategoryForAssetType('property', 'income')).toBe('rental_income');
		expect(defaultCategoryForAssetType('shares', 'expense')).toBe('living_expenses');
	});

	it('creates a default draft', () => {
		const draft = createDefaultCashflowDraft({
			assetType: 'property',
			type: 'expense',
			startDate: '01 2031',
			assetAccountId: 'aa1'
		});
		expect(draft.category).toBe('asset_ownership');
		expect(draft.assetAccountId).toBe('aa1');
		expect(draft.frequency).toBe('monthly');
	});

	it('coerces categories for constrained asset types', () => {
		const personExpense = coerceDraftForAssetType('person', 'expense', {
			type: 'expense',
			category: 'misc_income',
			frequency: 'monthly',
			amount: '10',
			description: '',
			startDate: '01 2030',
			endDate: '',
			inflationAffected: true,
			assetAccountId: 'a'
		});
		expect(personExpense.category).toBe('living_expenses');
	});

	it('creates edit draft from cashflow summary', () => {
		const draft = createEditCashflowDraft(
			{
				id: 'c1',
				cashflow_type: 'income',
				category: 'rental_income',
				frequency: 'monthly',
				amount: 42,
				inflation_affected: true,
				start_date: 203001,
				end_date: null,
				description: 'Rent',
				source_asset_account_id: null,
				destination_asset_account_id: 'aa1',
				source_account_id: null,
				destination_account_id: 'acc1',
				source_asset_id: null,
				destination_asset_id: 'asset1',
				source_asset_name: null,
				destination_asset_name: 'Asset',
				source_account_name: null,
				destination_account_name: 'Account'
			},
			'income',
			() => '01 2030'
		);
		expect(draft.amount).toBe('42');
		expect(draft.assetAccountId).toBe('aa1');
		expect(draft.cashflowId).toBe('c1');
	});
});

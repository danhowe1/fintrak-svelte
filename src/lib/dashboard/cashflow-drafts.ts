import type { CashflowDraft, CashflowSummary } from './types';

export type CashflowAssetType = 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';

const fallbackCategory = (type: 'income' | 'expense'): CashflowDraft['category'] =>
	type === 'income' ? 'employment_income' : 'living_expenses';

export const defaultCategoryForAssetType = (
	assetType: CashflowAssetType,
	type: 'income' | 'expense'
): CashflowDraft['category'] => {
	if (assetType === 'person') {
		return type === 'expense' ? 'living_expenses' : 'employment_income';
	}
	if (assetType === 'property') {
		return type === 'income' ? 'rental_income' : 'asset_ownership';
	}
	return fallbackCategory(type);
};

export const coerceDraftForAssetType = (
	assetType: CashflowAssetType,
	type: 'income' | 'expense',
	draft: CashflowDraft
): CashflowDraft => {
	if (assetType === 'person' && type === 'expense') {
		return { ...draft, category: 'living_expenses' };
	}
	if (assetType === 'property') {
		return { ...draft, category: type === 'income' ? 'rental_income' : 'asset_ownership' };
	}
	return draft;
};

export const createDefaultCashflowDraft = (input: {
	assetType: CashflowAssetType;
	type: 'income' | 'expense';
	startDate: string;
	assetAccountId: string;
}): CashflowDraft => ({
	type: input.type,
	category: defaultCategoryForAssetType(input.assetType, input.type),
	frequency: 'monthly',
	amount: '',
	description: '',
	startDate: input.startDate,
	endDate: '',
	inflationAffected: true,
	assetAccountId: input.assetAccountId
});

const parseCategory = (value: string, type: 'income' | 'expense'): CashflowDraft['category'] => {
	if (
		value === 'living_expenses' ||
		value === 'employment_income' ||
		value === 'misc_income' ||
		value === 'asset_ownership' ||
		value === 'rental_income'
	) {
		return value;
	}
	return fallbackCategory(type);
};

export const createEditCashflowDraft = (
	cashflow: CashflowSummary,
	type: 'income' | 'expense',
	toMonthYearInput: (value: unknown) => string
): CashflowDraft => ({
	type,
	category: parseCategory(cashflow.category, type),
	frequency: cashflow.frequency,
	amount: String(cashflow.amount ?? ''),
	description: cashflow.description ?? '',
	startDate: toMonthYearInput(cashflow.start_date ?? ''),
	endDate: cashflow.end_date ? toMonthYearInput(cashflow.end_date) : '',
	inflationAffected: cashflow.inflation_affected,
	assetAccountId:
		type === 'expense'
			? (cashflow.source_asset_account_id ?? '')
			: (cashflow.destination_asset_account_id ?? ''),
	cashflowId: cashflow.id
});

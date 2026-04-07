import type {
	AssetListItem,
	CashflowDraft,
	CashflowSummary,
	PropertyDetail,
	TransferDraft
} from '$lib/dashboard/types';
import type { PlannerLiquiditySaleShortcut } from '$lib/dashboard/planner-logic';

export const PLANNER_LIQUIDITY_ERRORS = {
	missingPersonAsset: 'Add a person asset first so income can be modeled.',
	missingExpenseCashflow:
		'No existing expense cashflows found. Add one first, then reduce it to improve liquidity.',
	missingSaleSource: 'No shares/super sale source is available for the first liquidity deficit month.',
	missingPropertyAsset: 'No property asset found to schedule a sale.'
} as const;

type LiquidityDeficitLike = {
	startDate?: number | null;
	deficitAmount?: number | null;
};

export const findFirstPersonAssetId = (assets: AssetListItem[]): string | null =>
	assets.find((asset) => asset.asset_type === 'person')?.id ?? null;

export const buildLiquidityIncomeDraftPatch = (input: {
	existing: CashflowDraft;
	firstLiquidityDeficit: LiquidityDeficitLike | null;
	monthLabelFromDate: (value: number) => string;
}): Partial<CashflowDraft> => {
	const { existing, firstLiquidityDeficit, monthLabelFromDate } = input;
	const deficitMonth = firstLiquidityDeficit?.startDate
		? monthLabelFromDate(firstLiquidityDeficit.startDate)
		: existing.startDate;
	const deficitAmount = firstLiquidityDeficit?.deficitAmount ?? 0;
	return {
		category: 'misc_income',
		frequency: 'monthly',
		startDate: deficitMonth,
		amount: deficitAmount > 0 ? String(Math.round(deficitAmount * 100) / 100) : existing.amount,
		description: existing.description || 'Liquidity support income'
	};
};

export const findBestLiquidityExpenseShortcut = (
	assets: AssetListItem[],
	cashflowsByAssetId: Record<string, CashflowSummary[]>
): { assetId: string; cashflow: CashflowSummary } | null => {
	let bestAssetId: string | null = null;
	let bestCashflow: CashflowSummary | null = null;
	for (const asset of assets) {
		if (asset.asset_type !== 'person' && asset.asset_type !== 'property') continue;
		for (const cashflow of cashflowsByAssetId[asset.id] ?? []) {
			if (cashflow.cashflow_type !== 'expense') continue;
			if (!bestCashflow || cashflow.amount > bestCashflow.amount) {
				bestCashflow = cashflow;
				bestAssetId = asset.id;
			}
		}
	}
	if (!bestAssetId || !bestCashflow) return null;
	return { assetId: bestAssetId, cashflow: bestCashflow };
};

export const buildLiquidityTransferDraft = (
	shortcut: PlannerLiquiditySaleShortcut,
	monthLabelFromDate: (value: number) => string
): TransferDraft => ({
	sourceAccountId: shortcut.sourceAccountId,
	destinationAccountId: shortcut.targetAccountId,
	amount: String(shortcut.amount),
	frequency: 'one_time',
	startDate: monthLabelFromDate(shortcut.startDate),
	endDate: '',
	description: `Liquidity support transfer to ${shortcut.targetAccountName}`,
	inflationAffected: false
});

export const findFirstPropertyAsset = (assets: AssetListItem[]): AssetListItem | null =>
	assets.find((asset) => asset.asset_type === 'property') ?? null;

const toNumberOrZero = (value: unknown) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const buildLiquidityPropertySaleDetails = (input: {
	property: AssetListItem;
	existing: PropertyDetail | null;
	firstLiquidityDeficit: LiquidityDeficitLike | null;
	monthLabelFromDate: (value: number) => string;
	formatYearMonthInput: (value: unknown) => string;
}): PropertyDetail => {
	const { property, existing, firstLiquidityDeficit, monthLabelFromDate, formatYearMonthInput } = input;
	const saleDate = firstLiquidityDeficit?.startDate
		? monthLabelFromDate(firstLiquidityDeficit.startDate)
		: '';
	if (existing) {
		return { ...existing, saleDate };
	}
	return {
		name: property.name ?? '',
		startDate: formatYearMonthInput(property.start_date),
		marketValue: toNumberOrZero(property.details?.marketValue),
		marketGrowthRate: toNumberOrZero(property.details?.marketGrowthRate),
		saleDate,
		fixedSellingCosts: toNumberOrZero(property.details?.fixedSellingCosts),
		variableSellingCosts: toNumberOrZero(property.details?.variableSellingCosts)
	};
};

import { addMonthsToYearMonth, fromYearMonthInt, toYearMonthInt } from '$lib/yearMonth';
import type { Stage3Assessment, Stage3Profile } from '$lib/dashboard/types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type PlannerRunOutEvent = {
	tone?: string | null;
	message?: string | null;
	monthLabel?: string | null;
};

export type PlannerStageState = {
	stage1Passed: boolean;
	stage2Reached: boolean;
	stage2Passed: boolean;
	stage3Reached: boolean;
	stage3Passed: boolean;
	stage4Reached: boolean;
	stage4Passed: boolean;
};

export const findStage2RunOutEvent = (
	events: PlannerRunOutEvent[] | null | undefined
): PlannerRunOutEvent | null =>
	(events ?? []).find(
		(event) =>
			event.tone === 'negative' &&
			typeof event.message === 'string' &&
			event.message.includes('runs out of money.')
	) ?? null;

export const derivePlannerStageState = (
	firstLiquidityDeficit: unknown | null,
	stage2FirstRunOutEvent: PlannerRunOutEvent | null,
	stage3Assessment: Stage3Assessment | null
): PlannerStageState => {
	const stage1Passed = !firstLiquidityDeficit;
	const stage2Reached = stage1Passed;
	const stage2Passed = stage2Reached && !stage2FirstRunOutEvent;
	const stage3Reached = stage2Passed;
	const stage3Passed =
		stage3Reached &&
		(stage3Assessment?.safetyScore ?? 0) >= 60 &&
		(stage3Assessment?.resilienceScore ?? 0) >= 60;
	const stage4Reached = stage3Passed;
	const stage4Passed =
		stage4Reached &&
		(stage3Assessment?.growthScore ?? 0) >= 60 &&
		(stage3Assessment?.goalMatchScore ?? 0) >= 60;

	return {
		stage1Passed,
		stage2Reached,
		stage2Passed,
		stage3Reached,
		stage3Passed,
		stage4Reached,
		stage4Passed
	};
};

type ProjectionTransactionLike = {
	cashflowType?: string | null;
	category?: string | null;
	date?: number | null;
	amount?: number | null;
};

type ProjectionAccountSeriesLike = {
	accountId: string;
	points?: { balance?: number | null }[] | null;
};

type ProjectionAssetSeriesLike = {
	assetType?: string | null;
	points?: { value?: number | null }[] | null;
};

type ProjectionLiquidityPointLike = {
	date?: number | null;
	balance?: number | null;
};

type ProjectionDataLike = {
	startDate: number;
	transactions?: ProjectionTransactionLike[] | null;
	accounts?: ProjectionAccountSeriesLike[] | null;
	assets?: ProjectionAssetSeriesLike[] | null;
	liquidity?: { points?: ProjectionLiquidityPointLike[] | null } | null;
};

type AccountLike = {
	id: string;
	account_type?: string | null;
};

type AssetAccountLinkLike = {
	relationship_role?: string | null;
	account_id: string;
};

type AccountBalanceTargetLike = {
	account_id: string;
	enabled?: boolean | null;
	min_balance?: number | null;
};

export const calculateStage3Assessment = (input: {
	stage3Reached: boolean;
	projectionData: ProjectionDataLike;
	accounts: AccountLike[];
	assetAccounts: AssetAccountLinkLike[];
	accountBalanceTargets: AccountBalanceTargetLike[];
}): Stage3Assessment | null => {
	const { stage3Reached, projectionData, accounts, assetAccounts, accountBalanceTargets } = input;
	if (!stage3Reached) return null;

	const startYearMonth = fromYearMonthInt(projectionData.startDate);
	if (!startYearMonth) return null;
	const firstYearDates = new Set<number>();
	for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
		firstYearDates.add(toYearMonthInt(addMonthsToYearMonth(startYearMonth, monthOffset)));
	}

	const totalEssentialOutgoingsFirstYear = (projectionData.transactions ?? [])
		.filter(
			(transaction) =>
				transaction.cashflowType === 'expense' &&
				(transaction.category === 'living_expenses' ||
					transaction.category === 'mortgage_repayment' ||
					transaction.category === 'asset_ownership') &&
				firstYearDates.has(transaction.date ?? 0)
		)
		.reduce((sum, transaction) => sum + Math.abs(transaction.amount ?? 0), 0);
	const monthlyEssentialOutgoings = totalEssentialOutgoingsFirstYear / 12;

	const cashAccountIds = new Set(
		accounts
			.filter((account) => account.account_type === 'cash_account')
			.map((account) => account.id)
	);
	const offsetAccountIds = new Set(
		(assetAccounts ?? [])
			.filter((link) => link.relationship_role === 'offsets')
			.map((link) => link.account_id)
	);
	const liquidBufferAccountIds = new Set([...cashAccountIds, ...offsetAccountIds]);

	const openingBalanceByAccountId = new Map(
		(projectionData.accounts ?? []).map((series) => [
			series.accountId,
			series.points?.[0]?.balance ?? 0
		])
	);
	const reserveByAccountId = new Map(
		(accountBalanceTargets ?? [])
			.filter((target) => target.enabled)
			.map((target) => [target.account_id, Math.max(0, Number(target.min_balance) || 0)])
	);

	const availableCashBuffer = Array.from(liquidBufferAccountIds).reduce((sum, accountId) => {
		const openingBalance = openingBalanceByAccountId.get(accountId) ?? 0;
		const reserveAmount = reserveByAccountId.get(accountId) ?? 0;
		return sum + Math.max(0, openingBalance - reserveAmount);
	}, 0);

	const safetyMonths =
		monthlyEssentialOutgoings > 0
			? availableCashBuffer / monthlyEssentialOutgoings
			: availableCashBuffer > 0
				? 24
				: 0;
	const safetyScore =
		safetyMonths >= 12
			? 100
			: safetyMonths >= 6
				? 60 + ((safetyMonths - 6) / 6) * 40
				: safetyMonths >= 3
					? 30 + ((safetyMonths - 3) / 3) * 30
					: (safetyMonths / 3) * 30;

	const growthAssetValue = (projectionData.assets ?? [])
		.filter(
			(series) =>
				series.assetType === 'shares' ||
				series.assetType === 'superannuation' ||
				series.assetType === 'property'
		)
		.reduce((sum, series) => sum + Math.max(0, series.points?.[0]?.value ?? 0), 0);
	const defensiveValue = Array.from(liquidBufferAccountIds).reduce(
		(sum, accountId) => sum + Math.max(0, openingBalanceByAccountId.get(accountId) ?? 0),
		0
	);
	const allocationTotal = growthAssetValue + defensiveValue;
	const growthAllocationPct = allocationTotal > 0 ? (growthAssetValue / allocationTotal) * 100 : 0;
	const growthScore =
		growthAllocationPct >= 70
			? 100
			: growthAllocationPct >= 45
				? 40 + ((growthAllocationPct - 45) / 25) * 60
				: (growthAllocationPct / 45) * 40;

	const liquidityPoints = projectionData.liquidity?.points ?? [];
	let worstDrawdownPct = 0;
	let worstDrawdownStartDate: number | null = null;
	let worstDrawdownEndDate: number | null = null;
	for (let pointIndex = 0; pointIndex < liquidityPoints.length; pointIndex += 1) {
		const startBalance = liquidityPoints[pointIndex]?.balance ?? 0;
		if (startBalance <= 0) continue;
		const endIndex = Math.min(pointIndex + 12, liquidityPoints.length - 1);
		let minBalanceInWindow = startBalance;
		let minBalanceIndex = pointIndex;
		for (let sampleIndex = pointIndex + 1; sampleIndex <= endIndex; sampleIndex += 1) {
			const sampleBalance = liquidityPoints[sampleIndex]?.balance ?? startBalance;
			if (sampleBalance < minBalanceInWindow) {
				minBalanceInWindow = sampleBalance;
				minBalanceIndex = sampleIndex;
			}
		}
		const drawdownPct = ((startBalance - minBalanceInWindow) / startBalance) * 100;
		if (drawdownPct > worstDrawdownPct) {
			worstDrawdownPct = drawdownPct;
			worstDrawdownStartDate = liquidityPoints[pointIndex]?.date ?? null;
			worstDrawdownEndDate = liquidityPoints[minBalanceIndex]?.date ?? null;
		}
	}

	const resilienceScore = clamp(100 - worstDrawdownPct * 2, 0, 100);
	const horizonMonths = Math.max(1, (projectionData.liquidity?.points?.length ?? 1) - 1);
	const targetGrowthAllocationPct = horizonMonths <= 60 ? 40 : horizonMonths <= 120 ? 60 : 75;
	const goalMatchScore = clamp(
		100 - (Math.abs(growthAllocationPct - targetGrowthAllocationPct) / 35) * 100,
		0,
		100
	);

	const totalScore = Math.round(
		0.35 * clamp(safetyScore, 0, 100) +
			0.35 * clamp(growthScore, 0, 100) +
			0.2 * resilienceScore +
			0.1 * goalMatchScore
	);
	const profile: Stage3Profile =
		totalScore < 40 ? 'Conservative' : totalScore < 70 ? 'Balanced' : 'Growth';

	return {
		profile,
		totalScore,
		safetyScore: Math.round(clamp(safetyScore, 0, 100)),
		growthScore: Math.round(clamp(growthScore, 0, 100)),
		resilienceScore: Math.round(resilienceScore),
		goalMatchScore: Math.round(goalMatchScore),
		safetyMonths: Math.max(0, Number(safetyMonths.toFixed(1))),
		growthAllocationPct: Math.max(0, Number(growthAllocationPct.toFixed(1))),
		worstDrawdownPct: Math.max(0, Number(worstDrawdownPct.toFixed(1))),
		worstDrawdownStartDate,
		worstDrawdownEndDate,
		horizonMonths
	};
};

export type PlannerShortfallLike = {
	minBalance?: number | null;
	targetAccountId: string;
	targetAccountName?: string;
	monthLabel?: string;
	availableSourceAccounts?: {
		accountId: string;
		accountName: string;
		availableNow?: boolean;
		availableFromDate?: number | null;
	}[];
};

export type PlannerSourceOption = {
	id: string;
	name: string;
	availableNow?: boolean;
	availableFromDate?: number | null;
};

export const getStage2AccessibilityShortfall = (
	firstShortfall: PlannerShortfallLike | null
): PlannerShortfallLike | null =>
	firstShortfall && (firstShortfall.minBalance ?? 0) <= 0 ? firstShortfall : null;

export const getPlannerExistingRules = <
	TRule extends { target_account_id: string; enabled: boolean; priority_order: number }
>(
	stage2AccessibilityShortfall: PlannerShortfallLike | null,
	autoFundingRules: TRule[]
): TRule[] | null =>
	stage2AccessibilityShortfall
		? autoFundingRules
				.filter(
					(rule) =>
						rule.target_account_id === stage2AccessibilityShortfall.targetAccountId && rule.enabled
				)
				.sort((a, b) => a.priority_order - b.priority_order)
		: null;

export const getPlannerSourceOptions = (
	stage2AccessibilityShortfall: PlannerShortfallLike | null,
	plannerExistingRules: { source_account_id: string }[] | null
): PlannerSourceOption[] => {
	if (!stage2AccessibilityShortfall) return [];
	const usedSourceIds = new Set((plannerExistingRules ?? []).map((rule) => rule.source_account_id));
	return (stage2AccessibilityShortfall.availableSourceAccounts ?? [])
		.filter(
			(option) =>
				option.accountId !== stage2AccessibilityShortfall.targetAccountId &&
				!usedSourceIds.has(option.accountId)
		)
		.map((option) => ({
			id: option.accountId,
			name: option.accountName,
			availableNow: option.availableNow,
			availableFromDate: option.availableFromDate
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
};

export const getPlannerSourceAvailabilityWarning = (
	plannerSelectedSourceOption: PlannerSourceOption | null,
	toMonthLabel: (value: number) => string
) => {
	if (!plannerSelectedSourceOption || plannerSelectedSourceOption.availableNow) return '';
	return plannerSelectedSourceOption.availableFromDate
		? `${plannerSelectedSourceOption.name} is not available yet. Transfers will take over from ${toMonthLabel(plannerSelectedSourceOption.availableFromDate)}.`
		: `${plannerSelectedSourceOption.name} is not available yet and can be used once it becomes available.`;
};

type PlannerDeficitLike = {
	startDate: number;
	deficitAmount: number;
};

type PlannerSeriesLike = {
	id: string;
	points?: { date: number; balance: number }[];
};

type PlannerAssetLike = {
	id: string;
	asset_type: string;
};

type PlannerAccountLike = {
	id: string;
	name: string;
	account_type?: string;
};

type PlannerAssetAccountLike = {
	asset_id: string;
	account_id: string;
	relationship_role: string;
};

export type PlannerLiquiditySaleShortcut = {
	sourceAccountId: string;
	sourceAccountName: string;
	targetAccountId: string;
	targetAccountName: string;
	startDate: number;
	amount: number;
};

const getSeriesPointBalanceAtDate = (
	series: { points?: { date: number; balance: number }[] } | null,
	date: number
) => series?.points?.find((point) => point.date === date)?.balance ?? 0;

const getAssetHeldInAccountId = (assetId: string, assetAccounts: PlannerAssetAccountLike[]) =>
	assetAccounts.find((link) => link.asset_id === assetId && link.relationship_role === 'held_in')
		?.account_id ?? null;

const getPrimaryCashAccountId = (accounts: PlannerAccountLike[]) =>
	accounts.find((account) => account.account_type === 'cash_account')?.id ?? '';

export const getPlannerLiquiditySaleShortcut = (input: {
	firstLiquidityDeficit: PlannerDeficitLike | null;
	plannerFirstShortfall: { targetAccountId?: string | null } | null;
	accounts: PlannerAccountLike[];
	assets: PlannerAssetLike[];
	assetAccounts: PlannerAssetAccountLike[];
	liquiditySeries: PlannerSeriesLike[];
}): PlannerLiquiditySaleShortcut | null => {
	const {
		firstLiquidityDeficit,
		plannerFirstShortfall,
		accounts,
		assets,
		assetAccounts,
		liquiditySeries
	} = input;
	const deficit = firstLiquidityDeficit;
	if (!deficit) return null;

	const targetAccountId =
		plannerFirstShortfall?.targetAccountId ?? getPrimaryCashAccountId(accounts);
	if (!targetAccountId) return null;
	const targetAccount = accounts.find((account) => account.id === targetAccountId);
	if (!targetAccount) return null;

	const candidates: { accountId: string; accountName: string; availableAmount: number }[] = [];
	for (const item of liquiditySeries) {
		if (!item.id.startsWith('asset:')) continue;
		const assetId = item.id.slice('asset:'.length);
		const asset = assets.find((entry) => entry.id === assetId);
		if (!asset || (asset.asset_type !== 'shares' && asset.asset_type !== 'superannuation'))
			continue;
		const accountId = getAssetHeldInAccountId(assetId, assetAccounts);
		if (!accountId || accountId === targetAccountId) continue;
		const account = accounts.find((entry) => entry.id === accountId);
		if (!account) continue;
		const availableAmount = getSeriesPointBalanceAtDate(item, deficit.startDate);
		if (availableAmount <= 0) continue;
		candidates.push({ accountId, accountName: account.name, availableAmount });
	}

	candidates.sort((a, b) => b.availableAmount - a.availableAmount);
	const source = candidates[0];
	if (!source) return null;

	const amount = Math.max(
		1,
		Math.round(Math.min(deficit.deficitAmount, source.availableAmount) * 100) / 100
	);
	return {
		sourceAccountId: source.accountId,
		sourceAccountName: source.accountName,
		targetAccountId: targetAccount.id,
		targetAccountName: targetAccount.name,
		startDate: deficit.startDate,
		amount
	};
};

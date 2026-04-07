<script lang="ts">
	import type { PageData } from './$types';
	import { afterUpdate, onDestroy, tick } from 'svelte';
	import Chart from 'chart.js/auto';
	import {
		addMonthsToYearMonth,
		formatYearMonthInput,
		fromYearMonthInt,
		normalizeYearMonthValue,
		toYearMonthInt
	} from '$lib/yearMonth';

	export let data: PageData;

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

	const formatWholeCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0,
			minimumFractionDigits: 0
		}).format(value);

	const formatLabel = (value: string) =>
		value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const formatSignedCurrency = (value: number) => {
		const formatted = formatCurrency(Math.abs(value));
		return value < 0 ? `-${formatted}` : formatted;
	};

	const formatRate = (value: number, decimals: number) =>
		Number.isFinite(value) ? value.toFixed(decimals) : '0';

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

let projectionData = data.projection;
let sessionRates = data.sessionRates;
let projectionVersion = 1;
let projectionError: string | null = null;
let refreshProjectionRequestId = 0;
let cashflows = data.cashflows ?? [];
let autoRunProjection = true;
let whatIfPanelElement: HTMLElement | null = null;

	const chartColors = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0f172a'];
	const cashflowCategoryOptions = [
		{ value: 'living_expenses', label: 'Living expenses' },
		{ value: 'employment_income', label: 'Employment income' },
		{ value: 'misc_income', label: 'Misc income' },
		{ value: 'rental_income', label: 'Rental income' },
		{ value: 'asset_ownership', label: 'Asset ownership' }
	];
	const personIncomeCategoryOptions = [
		{ value: 'employment_income', label: 'Employment income' },
		{ value: 'misc_income', label: 'Misc income' }
	];
	const propertyIncomeCategoryOptions = [{ value: 'rental_income', label: 'Rental income' }];
	const propertyExpenseCategoryOptions = [{ value: 'asset_ownership', label: 'Asset ownership' }];
	const cashflowFrequencyOptions = [
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'quarterly', label: 'Quarterly' },
		{ value: 'annually', label: 'Annually' },
		{ value: 'one_time', label: 'One time' }
	];
	const CASH_ACCOUNT_SELECTION_PREFIX = 'account:';

	type ProjectionRange = '1y' | '5y' | '10y' | 'all';
	type AssetPanelTab = 'assets' | 'accounts' | 'transfers' | 'reserves' | 'caps';
	type ProjectionBalanceSource = 'accounts' | 'assets' | 'net_worth' | 'liquidity';
	type CashflowDraft = {
		type: 'income' | 'expense';
		category:
			| 'living_expenses'
			| 'employment_income'
			| 'misc_income'
			| 'asset_ownership'
			| 'rental_income';
		frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
		amount: string;
		description: string;
		startDate: string;
		endDate: string;
		inflationAffected: boolean;
		assetAccountId: string;
		cashflowId?: string;
	};

	const normalizeProjectionRange = (value: unknown): ProjectionRange => {
		if (value === '1y' || value === '5y' || value === '10y' || value === 'all') return value;
		return 'all';
	};

	let projectionView: 'balances' | 'transactions' | 'balance_sheet' | 'profit_loss' = 'balances';
	let projectionBalanceSource: ProjectionBalanceSource = 'liquidity';
	let projectionRange: ProjectionRange = normalizeProjectionRange(data.projectionRange);
	let assetPanelTab: AssetPanelTab = 'assets';
	let isUpdating = false;
	let updateLocks = new Set<string>();
	let expandedPnlNodes = new Set<string>();
	let assetsList = data.assets ?? [];
	let accountsList = data.accounts ?? [];
	let assetAccountsList = data.assetAccounts ?? [];
	let autoFundingRules = data.autoFundingRules ?? [];
	let reserveOrderOverridesByTarget: Record<string, string[]> = {};
	let accountBalanceTargets = data.accountBalanceTargets ?? [];
	let autoSweepRules = data.autoSweepRules ?? [];
let fundingReserveDrafts: Record<string, string> = {};
let fundingCapDrafts: Record<string, string> = {};
let fundingCashAccountOptions: typeof transferAccountOptions = [];
let fundingReserveRulesByAccount: Record<string, typeof autoFundingRules> = {};
let fundingReserveSourceOptionsByAccount: Record<string, typeof transferAccountOptions> = {};
let fundingReservePriorityRowCount = 1;
let fundingSweepRulesByAccount: Record<string, typeof autoSweepRules> = {};
let fundingSweepDestinationOptionsByAccount: Record<string, typeof transferAccountOptions> = {};
let fundingCapPriorityRowCount = 1;
let fundingTabError = '';
	let personRetirementAges: Record<string, number> = {};
	let personDetails: Record<string, { name: string; startDate: string; dob: string }> = {};
	let cashflowAmounts: Record<string, number> = {};
	let propertyDetails: Record<
		string,
		{
			name: string;
			startDate: string;
			marketValue: number;
			marketGrowthRate: number;
			saleDate: string;
			fixedSellingCosts: number;
			variableSellingCosts: number;
		}
	> = {};
	let shareDetails: Record<
		string,
		{
			name: string;
			startDate: string;
			capitalGrowthRate: number;
			dividendYield: number;
			dividendsTakenAsIncomeDate: string;
		}
	> = {};
	let accountInterestRates: Record<string, number> = {};
	let propertyErrors: Record<
		string,
		{
			name?: string;
			startDate?: string;
			saleDate?: string;
			marketValue?: string;
			fixedSellingCosts?: string;
			variableSellingCosts?: string;
		}
	> = {};
	let shareErrors: Record<
		string,
		{
			name?: string;
			startDate?: string;
			capitalGrowthRate?: string;
			dividendYield?: string;
			dividendsTakenAsIncomeDate?: string;
		}
	> = {};
	let mortgageDetails: Record<
		string,
		{
			name: string;
			startDate: string;
			termYears: number;
			termMonths: number;
			mortgageAccountName: string;
			openingBalance: number;
		}
	> = {};
	let mortgageErrors: Record<
		string,
		{
			name?: string;
			startDate?: string;
			termYears?: string;
			termMonths?: string;
			mortgageAccountName?: string;
			openingBalance?: string;
		}
	> = {};
	let personDetailsErrors: Record<string, { name?: string; startDate?: string; dob?: string }> = {};
	let cashflowFormErrors: Record<string, string> = {};
	let lastScenarioId = data.scenario.id;
	let updateTimers: Record<string, ReturnType<typeof setTimeout>> = {};
	let activeCashflowForm: {
		assetId: string;
		type: 'income' | 'expense';
		cashflowId?: string;
	} | null = null;
	let cashflowDrafts: Record<string, CashflowDraft> = {};
	let cashflowsByAssetId: Record<string, typeof cashflows> = {};
	let editingCashflowIds = new Set<string>();
	let expandedPersonDetailIds = new Set<string>();
	let expandedPropertyDetailIds = new Set<string>();
	let expandedMortgageDetailIds = new Set<string>();
	let expandedShareDetailIds = new Set<string>();
	let deleteConfirmId: string | null = null;
	let transferFormError = '';
	let transferInlineError = '';
	let transferDraft = {
		sourceAccountId: '',
		destinationAccountId: '',
		amount: '',
		frequency: 'monthly' as 'monthly' | 'quarterly' | 'annually' | 'one_time',
		startDate: '',
		endDate: '',
		description: '',
		inflationAffected: false
	};
	let transferCashflows: typeof cashflows = [];
	let transferAccountOptions: { id: string; name: string }[] = [];
	let transferEditDrafts: Record<
		string,
		{
			sourceAccountId: string;
			destinationAccountId: string;
			amount: string;
			frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
			startDate: string;
			endDate: string;
			description: string;
		}
	> = {};
	let accountEditDrafts: Record<
		string,
		{
			startDate: string;
			name: string;
			openingBalance: string;
		}
	> = {};
let accountInlineError = '';
let plannerSourceAccountId = '';
let autoFundingRuleError = '';
let plannerLiquidityShortcutError = '';
let plannerAdvancedOpenStage: 'stage3' | 'stage4' = 'stage3';
let wasStage3Passed = false;
type Stage3Profile = 'Conservative' | 'Balanced' | 'Growth';
type Stage3Assessment = {
	profile: Stage3Profile;
	totalScore: number;
		safetyScore: number;
		growthScore: number;
		resilienceScore: number;
	goalMatchScore: number;
	safetyMonths: number;
	growthAllocationPct: number;
	worstDrawdownPct: number;
	worstDrawdownStartDate: number | null;
	worstDrawdownEndDate: number | null;
	horizonMonths: number;
};
	let stage3Assessment: Stage3Assessment | null = null;

	const getRetirementAge = (asset: { details?: Record<string, unknown> }) => {
		const details = asset.details ?? {};
		const raw = details.retirementAge;
		const value = typeof raw === 'number' ? raw : Number(raw);
		return Number.isFinite(value) ? value : 0;
	};

	const getPrimaryCashAccountId = () =>
		accountsList.find((account) => account.account_type === 'cash_account')?.id ?? '';

	const getLiquidityPlannerTargetAccountId = () =>
		plannerFirstShortfall?.targetAccountId ?? getPrimaryCashAccountId();

	const getAssetHeldInAccountId = (assetId: string) =>
		assetAccountsList.find(
			(link) => link.asset_id === assetId && link.relationship_role === 'held_in'
		)?.account_id ?? null;

	const getSeriesPointBalanceAtDate = (
		series: { points?: { date: number; balance: number }[] } | null,
		date: number
	) => series?.points?.find((point) => point.date === date)?.balance ?? 0;

	const getPlannerLiquiditySaleShortcut = () => {
		const deficit = plannerFirstLiquidityDeficit;
		if (!deficit) return null;
		const targetAccountId = getLiquidityPlannerTargetAccountId();
		if (!targetAccountId) return null;
		const targetAccount = accountsList.find((account) => account.id === targetAccountId);
		if (!targetAccount) return null;
		const series = projectionData.liquidity?.series ?? [];
		const candidates: { accountId: string; accountName: string; availableAmount: number }[] = [];
		for (const item of series) {
			if (!item.id.startsWith('asset:')) continue;
			const assetId = item.id.slice('asset:'.length);
			const asset = assetsList.find((entry) => entry.id === assetId);
			if (!asset || (asset.asset_type !== 'shares' && asset.asset_type !== 'superannuation'))
				continue;
			const accountId = getAssetHeldInAccountId(assetId);
			if (!accountId || accountId === targetAccountId) continue;
			const account = accountsList.find((entry) => entry.id === accountId);
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

	$: plannerFirstShortfall = projectionData.planner?.firstShortfall ?? null;
	$: plannerFirstLiquidityDeficit = projectionData.planner?.firstLiquidityDeficit ?? null;
	$: plannerStage = projectionData.planner?.stage ?? 'reserves_caps';
	$: stage2FirstRunOutEvent =
		(projectionData.events ?? []).find(
			(event) =>
				event.tone === 'negative' &&
				typeof event.message === 'string' &&
				event.message.includes('runs out of money.')
		) ?? null;
	$: if (!stage2Passed) {
		plannerAdvancedOpenStage = 'stage3';
	}
	$: plannerLiquiditySaleShortcut = getPlannerLiquiditySaleShortcut();
	$: stage1Passed = !plannerFirstLiquidityDeficit;
	$: stage2Reached = stage1Passed;
	$: stage2Passed = stage2Reached && !stage2FirstRunOutEvent;
	$: stage3Reached = stage2Passed;
	$: stage3Passed =
		stage3Reached &&
		(stage3Assessment?.safetyScore ?? 0) >= 60 &&
		(stage3Assessment?.resilienceScore ?? 0) >= 60;
	$: stage4Reached = stage3Passed;
	$: stage4Passed =
		stage4Reached &&
		(stage3Assessment?.growthScore ?? 0) >= 60 &&
		(stage3Assessment?.goalMatchScore ?? 0) >= 60;
	$: {
		if (stage3Passed && !wasStage3Passed) {
			plannerAdvancedOpenStage = 'stage4';
		}
		wasStage3Passed = stage3Passed;
	}
	$: stage3Assessment = (() => {
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
					firstYearDates.has(transaction.date)
			)
			.reduce((sum, transaction) => sum + Math.abs(transaction.amount ?? 0), 0);
		const monthlyEssentialOutgoings = totalEssentialOutgoingsFirstYear / 12;
		const cashAccountIds = new Set(
			accountsList
				.filter((account) => account.account_type === 'cash_account')
				.map((account) => account.id)
		);
		const offsetAccountIds = new Set(
			(assetAccountsList ?? [])
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
		const growthAllocationPct =
			allocationTotal > 0 ? (growthAssetValue / allocationTotal) * 100 : 0;
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
	})();
	$: stage1PlannerMessage = plannerFirstLiquidityDeficit
		? `${plannerFirstLiquidityDeficit.monthLabel}: Liquidity falls below $0 by ${formatWholeCurrency(plannerFirstLiquidityDeficit.deficitAmount)}.`
		: '';
	$: stage2PlannerMessage = stage2FirstRunOutEvent
		? stage2FirstRunOutEvent.monthLabel
			? `${stage2FirstRunOutEvent.monthLabel}: ${stage2FirstRunOutEvent.message}`
			: stage2FirstRunOutEvent.message
		: 'Auto-funding needs attention.';
	$: stage2AllocationShortfall =
		plannerFirstShortfall && plannerFirstShortfall.minBalance <= 0 ? plannerFirstShortfall : null;
	$: plannerExistingRules = stage2AllocationShortfall
		? autoFundingRules
				.filter(
					(rule) => rule.target_account_id === stage2AllocationShortfall.targetAccountId && rule.enabled
				)
				.sort((a, b) => a.priority_order - b.priority_order)
		: null;
	$: plannerSourceOptions = (() => {
		if (!stage2AllocationShortfall) return [];
		const usedSourceIds = new Set(
			(plannerExistingRules ?? []).map((rule) => rule.source_account_id)
		);
		return (stage2AllocationShortfall.availableSourceAccounts ?? [])
			.filter(
				(option) =>
					option.accountId !== stage2AllocationShortfall.targetAccountId &&
					!usedSourceIds.has(option.accountId)
			)
			.map((option) => ({
				id: option.accountId,
				name: option.accountName,
				availableNow: option.availableNow,
				availableFromDate: option.availableFromDate
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	})();
	$: plannerSelectedSourceOption =
		plannerSourceOptions.find((option) => option.id === plannerSourceAccountId) ?? null;
	$: plannerSourceAvailabilityWarning =
		plannerSelectedSourceOption && !plannerSelectedSourceOption.availableNow
			? plannerSelectedSourceOption.availableFromDate
				? `${plannerSelectedSourceOption.name} is not available yet. Transfers will take over from ${monthLabelFromDate(plannerSelectedSourceOption.availableFromDate)}.`
				: `${plannerSelectedSourceOption.name} is not available yet and can be used once it becomes available.`
			: '';
	$: if (
		plannerSourceAccountId &&
		!plannerSourceOptions.some((option) => option.id === plannerSourceAccountId)
	) {
		plannerSourceAccountId = '';
	}
	$: {
		const nextReserveDrafts = { ...fundingReserveDrafts };
		const nextCapDrafts = { ...fundingCapDrafts };
		let changed = false;
		for (const account of transferAccountOptions) {
			const target = accountBalanceTargets.find(
				(item) => item.account_id === account.id && item.enabled
			);
			if (nextReserveDrafts[account.id] === undefined) {
				nextReserveDrafts[account.id] = String(target?.min_balance ?? 0);
				changed = true;
			}
			if (nextCapDrafts[account.id] === undefined) {
				nextCapDrafts[account.id] = target?.max_balance == null ? '' : String(target.max_balance);
				changed = true;
			}
		}
		if (changed) {
			fundingReserveDrafts = nextReserveDrafts;
			fundingCapDrafts = nextCapDrafts;
		}
	}

	$: assetsList = data.assets ?? [];
	$: accountsList = data.accounts ?? [];
	$: assetAccountsList = data.assetAccounts ?? [];

	$: if (data.scenario.id !== lastScenarioId) {
		personRetirementAges = {};
		personDetails = {};
		cashflowAmounts = {};
		propertyDetails = {};
		shareDetails = {};
		accountInterestRates = {};
		propertyErrors = {};
		shareErrors = {};
		mortgageDetails = {};
		mortgageErrors = {};
		personDetailsErrors = {};
		cashflowFormErrors = {};
		activeCashflowForm = null;
		cashflowDrafts = {};
		updateTimers = {};
		editingCashflowIds = new Set();
		expandedPersonDetailIds = new Set();
		expandedPropertyDetailIds = new Set();
		expandedMortgageDetailIds = new Set();
		expandedShareDetailIds = new Set();
		transferFormError = '';
		transferInlineError = '';
		accountInlineError = '';
		autoFundingRuleError = '';
		plannerLiquidityShortcutError = '';
		reserveOrderOverridesByTarget = {};
		setAutoFundingRules(data.autoFundingRules ?? []);
		accountBalanceTargets = data.accountBalanceTargets ?? [];
		autoSweepRules = data.autoSweepRules ?? [];
		plannerSourceAccountId = '';
		plannerAdvancedOpenStage = 'stage3';
		fundingReserveDrafts = {};
		fundingCapDrafts = {};
		fundingTabError = '';
		transferDraft = {
			sourceAccountId: '',
			destinationAccountId: '',
			amount: '',
			frequency: 'monthly',
			startDate: '',
			endDate: '',
			description: '',
			inflationAffected: false
		};
		transferEditDrafts = {};
		accountEditDrafts = {};
		lastScenarioId = data.scenario.id;
	}

	$: if (Object.keys(personRetirementAges).length === 0 && (assetsList.length ?? 0) > 0) {
		const next: Record<string, number> = {};
		for (const asset of assetsList) {
			if (asset.asset_type === 'person') {
				next[asset.id] = getRetirementAge(asset);
			}
		}
		personRetirementAges = next;
	}

	$: if (Object.keys(personDetails).length === 0 && (assetsList.length ?? 0) > 0) {
		const next: Record<string, { name: string; startDate: string; dob: string }> = {};
		for (const asset of assetsList) {
			if (asset.asset_type === 'person') {
				next[asset.id] = {
					name: asset.name ?? '',
					startDate: formatYearMonthInput(asset.start_date),
					dob: formatYearMonthInput(asset.details?.dob)
				};
			}
		}
		personDetails = next;
	}

	$: if (Object.keys(cashflowAmounts).length === 0 && (cashflows?.length ?? 0) > 0) {
		const next: Record<string, number> = {};
		for (const cashflow of cashflows ?? []) {
			next[cashflow.id] = cashflow.amount;
		}
		cashflowAmounts = next;
	}

	$: if (Object.keys(propertyDetails).length === 0 && (assetsList.length ?? 0) > 0) {
		const next: Record<
			string,
			{
				name: string;
				startDate: string;
				marketValue: number;
				marketGrowthRate: number;
				saleDate: string;
				fixedSellingCosts: number;
				variableSellingCosts: number;
			}
		> = {};
		for (const asset of assetsList) {
			if (asset.asset_type === 'property') {
				const details = asset.details ?? {};
				const rawMarketValue = details.marketValue;
				const marketValue =
					typeof rawMarketValue === 'number' ? rawMarketValue : Number(rawMarketValue);
				const rawRate = details.marketGrowthRate;
				const rate = typeof rawRate === 'number' ? rawRate : Number(rawRate);
				const rawStartDate = asset.start_date;
				const startDate = formatYearMonthInput(rawStartDate);
				const rawSaleDate = details.saleDate;
				const saleDate = formatYearMonthInput(rawSaleDate);
				const rawFixedSellingCosts = details.fixedSellingCosts;
				const fixedSellingCosts =
					typeof rawFixedSellingCosts === 'number'
						? rawFixedSellingCosts
						: Number(rawFixedSellingCosts);
				const rawVariableSellingCosts = details.variableSellingCosts;
				const variableSellingCosts =
					typeof rawVariableSellingCosts === 'number'
						? rawVariableSellingCosts
						: Number(rawVariableSellingCosts);
				next[asset.id] = {
					name: asset.name ?? '',
					startDate,
					marketValue: Number.isFinite(marketValue) ? marketValue : 0,
					marketGrowthRate: Number.isFinite(rate) ? rate : 0,
					saleDate,
					fixedSellingCosts: Number.isFinite(fixedSellingCosts) ? fixedSellingCosts : 0,
					variableSellingCosts: Number.isFinite(variableSellingCosts) ? variableSellingCosts : 0
				};
			}
		}
		propertyDetails = next;
	}

	$: if (Object.keys(accountInterestRates).length === 0 && (accountsList.length ?? 0) > 0) {
		const next: Record<string, number> = {};
		for (const account of accountsList) {
			const rawRate = account.details?.interestRate;
			const rate = typeof rawRate === 'number' ? rawRate : Number(rawRate);
			next[account.id] = Number.isFinite(rate) ? rate : 0;
		}
		accountInterestRates = next;
	}

	$: if (Object.keys(shareDetails).length === 0 && (assetsList.length ?? 0) > 0) {
		const next: Record<
			string,
			{
				name: string;
				startDate: string;
				capitalGrowthRate: number;
				dividendYield: number;
				dividendsTakenAsIncomeDate: string;
			}
		> = {};
		for (const asset of assetsList) {
			if (asset.asset_type !== 'shares') continue;
			const details = asset.details ?? {};
			const rawCapitalGrowthRate = details.capitalGrowthRate;
			const rawDividendYield = details.dividendYield;
			const capitalGrowthRate =
				typeof rawCapitalGrowthRate === 'number'
					? rawCapitalGrowthRate
					: Number(rawCapitalGrowthRate ?? 0);
			const dividendYield =
				typeof rawDividendYield === 'number' ? rawDividendYield : Number(rawDividendYield ?? 0);
			next[asset.id] = {
				name: asset.name ?? '',
				startDate: formatYearMonthInput(asset.start_date),
				capitalGrowthRate: Number.isFinite(capitalGrowthRate) ? capitalGrowthRate : 0,
				dividendYield: Number.isFinite(dividendYield) ? dividendYield : 0,
				dividendsTakenAsIncomeDate: formatYearMonthInput(details.dividendsTakenAsIncomeDate)
			};
		}
		shareDetails = next;
	}

	$: if (Object.keys(mortgageDetails).length === 0 && (assetsList.length ?? 0) > 0) {
		const accountsById = new Map(accountsList.map((account) => [account.id, account]));
		const heldInByAssetId = new Map(
			assetAccountsList
				.filter((link) => link.relationship_role === 'held_in')
				.map((link) => [link.asset_id, link.account_id])
		);
		const next: Record<
			string,
			{
				name: string;
				startDate: string;
				termYears: number;
				termMonths: number;
				mortgageAccountName: string;
				openingBalance: number;
			}
		> = {};
		for (const asset of assetsList) {
			if (asset.asset_type !== 'mortgage') continue;
			const details = asset.details ?? {};
			const accountId = heldInByAssetId.get(asset.id);
			const account = accountId ? accountsById.get(accountId) : null;
			const rawTermYears = details.termYears;
			const rawTermMonths = details.termMonths;
			const termYears = typeof rawTermYears === 'number' ? rawTermYears : Number(rawTermYears ?? 0);
			const termMonths =
				typeof rawTermMonths === 'number' ? rawTermMonths : Number(rawTermMonths ?? 0);
			const rawOpeningBalance = account?.opening_balance;
			const openingBalance =
				typeof rawOpeningBalance === 'number' ? rawOpeningBalance : Number(rawOpeningBalance ?? 0);
			next[asset.id] = {
				name: asset.name ?? '',
				startDate: formatYearMonthInput(asset.start_date),
				termYears: Number.isFinite(termYears) ? Math.max(0, Math.round(termYears)) : 0,
				termMonths: Number.isFinite(termMonths)
					? Math.min(11, Math.max(0, Math.round(termMonths)))
					: 0,
				mortgageAccountName: account?.name ?? 'Mortgage account',
				openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0
			};
		}
		mortgageDetails = next;
	}

	const setPersonRetirementAge = (id: string, value: number) => {
		personRetirementAges = { ...personRetirementAges, [id]: value };
	};

	const setPersonDetails = (
		id: string,
		value: { name: string; startDate: string; dob: string }
	) => {
		personDetails = { ...personDetails, [id]: value };
	};

	const setPersonDetailsError = (
		id: string,
		field: 'name' | 'startDate' | 'dob',
		message: string
	) => {
		personDetailsErrors = {
			...personDetailsErrors,
			[id]: { ...(personDetailsErrors[id] ?? {}), [field]: message }
		};
	};

	const togglePersonDetails = (id: string) => {
		const next = new Set(expandedPersonDetailIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedPersonDetailIds = next;
	};

	$: cashflowsByAssetId = (() => {
		const next: Record<string, typeof cashflows> = {};
		for (const cashflow of cashflows ?? []) {
			const assetId =
				cashflow.cashflow_type === 'expense'
					? cashflow.source_asset_id
					: cashflow.cashflow_type === 'income'
						? cashflow.destination_asset_id
						: null;
			if (!assetId) continue;
			if (!next[assetId]) {
				next[assetId] = [];
			}
			next[assetId] = [...next[assetId], cashflow];
		}
		return next;
	})();

	$: transferCashflows = (cashflows ?? []).filter(
		(cashflow) => cashflow.cashflow_type === 'transfer'
	);

	$: transferAccountOptions = (() => {
		const accountIdsWithAssetLinks = new Set(assetAccountsList.map((link) => link.account_id));
		const assetsById = new Map(assetsList.map((asset) => [asset.id, asset]));
		const sharesBrokerageAccountIds = new Set(
			assetAccountsList
				.filter((link) => {
					if (link.relationship_role !== 'held_in') return false;
					const linkedAsset = assetsById.get(link.asset_id);
					return linkedAsset?.asset_type === 'shares';
				})
				.map((link) => link.account_id)
		);
		return accountsList
			.filter(
				(account) =>
					accountIdsWithAssetLinks.has(account.id) &&
					(account.account_type === 'cash_account' ||
						(account.account_type === 'brokerage' && sharesBrokerageAccountIds.has(account.id)) ||
						account.account_type === 'super_account')
			)
		.map((account) => ({ id: account.id, name: account.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
	})();
	$: fundingCashAccountOptions = transferAccountOptions.filter(
		(option) =>
			accountsList.find((account) => account.id === option.id)?.account_type === 'cash_account'
	);
	$: fundingReserveRulesByAccount = Object.fromEntries(
		fundingCashAccountOptions.map((account) => [
			account.id,
			autoFundingRules
				.filter((rule) => rule.target_account_id === account.id)
				.sort((a, b) => a.priority_order - b.priority_order)
		])
	);
	$: fundingReserveSourceOptionsByAccount = Object.fromEntries(
		fundingCashAccountOptions.map((account) => {
			const existingSourceIds = new Set(
				(fundingReserveRulesByAccount[account.id] ?? []).map((rule) => rule.source_account_id)
			);
			const options = transferAccountOptions.filter(
				(option) => option.id !== account.id && !existingSourceIds.has(option.id)
			);
			return [account.id, options];
		})
	);
	$: fundingReservePriorityRowCount = (() => {
		let maxRows = 1;
		for (const account of fundingCashAccountOptions) {
			const rows = (fundingReserveRulesByAccount[account.id]?.length ?? 0) + 1;
			if (rows > maxRows) maxRows = rows;
		}
		return maxRows;
	})();
	$: fundingSweepRulesByAccount = Object.fromEntries(
		fundingCashAccountOptions.map((account) => [
			account.id,
			autoSweepRules
				.filter((rule) => rule.source_account_id === account.id)
				.sort((a, b) => a.priority_order - b.priority_order)
		])
	);
	$: fundingSweepDestinationOptionsByAccount = Object.fromEntries(
		fundingCashAccountOptions.map((account) => {
			const existingDestinationIds = new Set(
				(fundingSweepRulesByAccount[account.id] ?? []).map((rule) => rule.destination_account_id)
			);
			const options = transferAccountOptions.filter(
				(option) => option.id !== account.id && !existingDestinationIds.has(option.id)
			);
			return [account.id, options];
		})
	);
	$: fundingCapPriorityRowCount = (() => {
		let maxRows = 1;
		for (const account of fundingCashAccountOptions) {
			const rows = (fundingSweepRulesByAccount[account.id]?.length ?? 0) + 1;
			if (rows > maxRows) maxRows = rows;
		}
		return maxRows;
	})();

	$: if (!transferDraft.startDate) {
		transferDraft = {
			...transferDraft,
			startDate:
				toMonthYearInput(projectionData.startDate) ||
				toMonthYearInput(assetsList[0]?.start_date) ||
				toMonthYearInput(accountsList[0]?.start_date) ||
				''
		};
	}

	$: {
		const nextDrafts = { ...transferEditDrafts };
		let changed = false;
		for (const transfer of transferCashflows) {
			if (nextDrafts[transfer.id]) continue;
			nextDrafts[transfer.id] = {
				sourceAccountId: transfer.source_account_id ?? '',
				destinationAccountId: transfer.destination_account_id ?? '',
				amount: String(transfer.amount ?? ''),
				frequency: transfer.frequency,
				startDate: toMonthYearInput(transfer.start_date),
				endDate: transfer.end_date ? toMonthYearInput(transfer.end_date) : '',
				description: transfer.description ?? ''
			};
			changed = true;
		}
		if (changed) {
			transferEditDrafts = nextDrafts;
		}
	}

	$: {
		const nextDrafts = { ...accountEditDrafts };
		let changed = false;
		const accountIds = new Set(accountsList.map((account) => account.id));
		for (const account of accountsList) {
			if (nextDrafts[account.id]) continue;
			nextDrafts[account.id] = {
				startDate: toMonthYearInput(account.start_date),
				name: account.name ?? '',
				openingBalance: String(account.opening_balance ?? 0)
			};
			changed = true;
		}
		for (const accountId of Object.keys(nextDrafts)) {
			if (accountIds.has(accountId)) continue;
			delete nextDrafts[accountId];
			changed = true;
		}
		if (changed) {
			accountEditDrafts = nextDrafts;
		}
	}

	$: if (
		transferDraft.sourceAccountId &&
		!transferAccountOptions.some((option) => option.id === transferDraft.sourceAccountId)
	) {
		transferDraft = { ...transferDraft, sourceAccountId: '' };
	}

	$: if (
		transferDraft.destinationAccountId &&
		!transferAccountOptions.some((option) => option.id === transferDraft.destinationAccountId)
	) {
		transferDraft = { ...transferDraft, destinationAccountId: '' };
	}

	const setCashflowAmount = (id: string, value: number) => {
		cashflowAmounts = { ...cashflowAmounts, [id]: value };
	};

	const monthLabelFromDate = (value?: unknown | null) => {
		if (!value) return '';
		return formatYearMonthInput(value);
	};

	const getAssetAccountOptions = (assetId: string) => {
		const assetType = getAssetType(assetId);
		const accountsById = new Map(accountsList.map((account) => [account.id, account]));
		const heldInLinks = assetAccountsList.filter(
			(link) => link.asset_id === assetId && link.relationship_role === 'held_in'
		);
		if (assetType === 'person' || assetType === 'property') {
			const heldInLinksByAccountId = new Map(heldInLinks.map((link) => [link.account_id, link]));
			return accountsList
				.filter((account) => account.account_type === 'cash_account')
				.map((account) => ({
					id:
						heldInLinksByAccountId.get(account.id)?.id ??
						`${CASH_ACCOUNT_SELECTION_PREFIX}${account.id}`,
					name: account.name ?? 'Account'
				}));
		}
		return heldInLinks.map((link) => ({
			id: link.id,
			name: accountsById.get(link.account_id)?.name ?? 'Account'
		}));
	};

	const getAssetType = (assetId: string) =>
		assetsList.find((asset) => asset.id === assetId)?.asset_type ?? 'person';

	const getCategoryOptionsFor = (assetId: string, type: 'income' | 'expense') => {
		const assetType = getAssetType(assetId);
		if (assetType === 'person') {
			if (type === 'expense') {
				return [{ value: 'living_expenses', label: 'Living expenses' }];
			}
			return personIncomeCategoryOptions;
		}
		if (assetType === 'property') {
			return type === 'income' ? propertyIncomeCategoryOptions : propertyExpenseCategoryOptions;
		}
		return cashflowCategoryOptions;
	};

	const syncCashflowAmounts = (nextCashflows: typeof cashflows) => {
		const next: Record<string, number> = { ...cashflowAmounts };
		for (const cashflow of nextCashflows ?? []) {
			if (editingCashflowIds.has(cashflow.id)) continue;
			next[cashflow.id] = cashflow.amount;
		}
		cashflowAmounts = next;
	};

	const getDraftKey = (assetId: string, type: 'income' | 'expense', cashflowId?: string) =>
		cashflowId ? `edit:${cashflowId}` : `new:${assetId}:${type}`;

	const getDefaultDraft = (
		assetId: string,
		type: 'income' | 'expense',
		assetType: string
	): CashflowDraft => {
		const now = new Date();
		const fallbackStartMonth = `${String(now.getMonth() + 1).padStart(2, '0')} ${now.getFullYear()}`;
		const defaultStartDate =
			monthLabelFromDate(
				assetsList.find((asset) => asset.asset_type === 'person')?.start_date ??
					accountsList[0]?.start_date ??
					''
			) || fallbackStartMonth;
		const options = getAssetAccountOptions(assetId);
		const defaultCategory: CashflowDraft['category'] =
			assetType === 'person'
				? type === 'expense'
					? 'living_expenses'
					: 'employment_income'
				: assetType === 'property'
					? type === 'income'
						? 'rental_income'
						: 'asset_ownership'
					: type === 'income'
						? 'employment_income'
						: 'living_expenses';
		return {
			type,
			category: defaultCategory,
			frequency: 'monthly',
			amount: '',
			description: '',
			startDate: defaultStartDate,
			endDate: '',
			inflationAffected: true,
			assetAccountId: options[0]?.id ?? ''
		};
	};

	const openCashflowForm = (assetId: string, type: 'income' | 'expense') => {
		activeCashflowForm = { assetId, type };
		const key = getDraftKey(assetId, type);
		if (!cashflowDrafts[key]) {
			const assetType = getAssetType(assetId);
			cashflowDrafts = { ...cashflowDrafts, [key]: getDefaultDraft(assetId, type, assetType) };
		} else {
			const assetType = getAssetType(assetId);
			if (assetType === 'person' && type === 'expense') {
				const draft = cashflowDrafts[key];
				if (draft.category !== 'living_expenses') {
					cashflowDrafts = {
						...cashflowDrafts,
						[key]: { ...draft, category: 'living_expenses' }
					};
				}
			}
			if (assetType === 'property') {
				const draft = cashflowDrafts[key];
				const forcedCategory = type === 'income' ? 'rental_income' : 'asset_ownership';
				if (draft.category !== forcedCategory) {
					cashflowDrafts = {
						...cashflowDrafts,
						[key]: { ...draft, category: forcedCategory }
					};
				}
			}
		}
	};

	const openCashflowFormForEdit = (assetId: string, cashflow: (typeof cashflows)[number]) => {
		const type = cashflow.cashflow_type as 'income' | 'expense';
		const key = getDraftKey(assetId, type, cashflow.id);
		activeCashflowForm = { assetId, type, cashflowId: cashflow.id };
		const assetType = getAssetType(assetId);
		const category: CashflowDraft['category'] =
			cashflow.category === 'living_expenses' ||
			cashflow.category === 'employment_income' ||
			cashflow.category === 'misc_income' ||
			cashflow.category === 'asset_ownership' ||
			cashflow.category === 'rental_income'
				? cashflow.category
				: type === 'income'
					? 'employment_income'
					: 'living_expenses';
		const draft = {
			type,
			category,
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
		};
		let coercedDraft = draft;
		if (assetType === 'person') {
			if (type === 'expense') {
				coercedDraft = { ...draft, category: 'living_expenses' };
			}
		}
		if (assetType === 'property') {
			const forcedCategory = type === 'income' ? 'rental_income' : 'asset_ownership';
			coercedDraft = { ...draft, category: forcedCategory };
		}
		cashflowDrafts = { ...cashflowDrafts, [key]: coercedDraft };
	};

	const closeCashflowForm = () => {
		activeCashflowForm = null;
	};

	const setCashflowDraft = (key: string, updates: Partial<CashflowDraft>) => {
		cashflowDrafts = {
			...cashflowDrafts,
			[key]: { ...cashflowDrafts[key], ...updates }
		};
	};

	const setPropertyDetails = (
		id: string,
		value: {
			name: string;
			startDate: string;
			marketValue: number;
			marketGrowthRate: number;
			saleDate: string;
			fixedSellingCosts: number;
			variableSellingCosts: number;
		}
	) => {
		propertyDetails = { ...propertyDetails, [id]: value };
	};

	const setPropertyError = (
		id: string,
		field:
			| 'name'
			| 'startDate'
			| 'saleDate'
			| 'marketValue'
			| 'fixedSellingCosts'
			| 'variableSellingCosts',
		message: string
	) => {
		propertyErrors = {
			...propertyErrors,
			[id]: { ...(propertyErrors[id] ?? {}), [field]: message }
		};
	};

	const togglePropertyDetails = (id: string) => {
		const next = new Set(expandedPropertyDetailIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedPropertyDetailIds = next;
	};

	const setMortgageDetails = (
		id: string,
		value: {
			name: string;
			startDate: string;
			termYears: number;
			termMonths: number;
			mortgageAccountName: string;
			openingBalance: number;
		}
	) => {
		mortgageDetails = { ...mortgageDetails, [id]: value };
	};

	const setMortgageError = (
		id: string,
		field:
			| 'name'
			| 'startDate'
			| 'termYears'
			| 'termMonths'
			| 'mortgageAccountName'
			| 'openingBalance',
		message: string
	) => {
		mortgageErrors = {
			...mortgageErrors,
			[id]: { ...(mortgageErrors[id] ?? {}), [field]: message }
		};
	};

	const toggleMortgageDetails = (id: string) => {
		const next = new Set(expandedMortgageDetailIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedMortgageDetailIds = next;
	};

	const toggleShareDetails = (id: string) => {
		const next = new Set(expandedShareDetailIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedShareDetailIds = next;
	};

	const setShareDetails = (
		id: string,
		value: {
			name: string;
			startDate: string;
			capitalGrowthRate: number;
			dividendYield: number;
			dividendsTakenAsIncomeDate: string;
		}
	) => {
		shareDetails = { ...shareDetails, [id]: value };
	};

	const setShareError = (
		id: string,
		field:
			| 'name'
			| 'startDate'
			| 'capitalGrowthRate'
			| 'dividendYield'
			| 'dividendsTakenAsIncomeDate',
		message: string
	) => {
		shareErrors = { ...shareErrors, [id]: { ...(shareErrors[id] ?? {}), [field]: message } };
	};

	const validateMortgageDetails = (
		id: string,
		value: {
			name: string;
			startDate: string;
			termYears: number;
			termMonths: number;
			mortgageAccountName: string;
			openingBalance: number;
		}
	) => {
		let hasError = false;
		if (!value.name.trim()) {
			setMortgageError(id, 'name', 'Name is required.');
			hasError = true;
		} else {
			setMortgageError(id, 'name', '');
		}
		if (!value.startDate.trim() || !isValidMonthYear(value.startDate)) {
			setMortgageError(id, 'startDate', 'Use MM YYYY format.');
			hasError = true;
		} else {
			setMortgageError(id, 'startDate', '');
		}
		if (!Number.isFinite(value.termYears) || value.termYears < 0) {
			setMortgageError(id, 'termYears', 'Use 0 or more years.');
			hasError = true;
		} else {
			setMortgageError(id, 'termYears', '');
		}
		if (
			!Number.isFinite(value.termMonths) ||
			value.termMonths < 0 ||
			value.termMonths > 11 ||
			!Number.isInteger(value.termMonths)
		) {
			setMortgageError(id, 'termMonths', 'Use a value from 0 to 11.');
			hasError = true;
		} else {
			setMortgageError(id, 'termMonths', '');
		}
		if (!value.mortgageAccountName.trim()) {
			setMortgageError(id, 'mortgageAccountName', 'Account name is required.');
			hasError = true;
		} else {
			setMortgageError(id, 'mortgageAccountName', '');
		}
		if (!Number.isFinite(value.openingBalance)) {
			setMortgageError(id, 'openingBalance', 'Use a valid number.');
			hasError = true;
		} else {
			setMortgageError(id, 'openingBalance', '');
		}
		return !hasError;
	};

	const setAccountInterestRate = (id: string, value: number) => {
		accountInterestRates = { ...accountInterestRates, [id]: value };
	};

	const roundToTwo = (value: number) => Math.round(value * 100) / 100;

	const adjustAccountInterestRate = (accountId: string, delta: number) => {
		const current = accountInterestRates[accountId] ?? 0;
		const next = roundToTwo(current + delta);
		setAccountInterestRate(accountId, next);
		scheduleUpdate(`account:${accountId}`, () => updateAccountInterestRate(accountId, next));
	};

	const isValidMonthYear = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());
	const toMonthYearInput = (value: unknown) => formatYearMonthInput(value);

	const stepForValue = (value: number) => {
		const absValue = Math.abs(value);
		if (absValue <= 1) return 0.25;
		if (absValue <= 100) return 1;
		if (absValue <= 1000) return 100;
		if (absValue <= 10000) return 500;
		if (absValue <= 100000) return 5000;
		if (absValue <= 1000000) return 50000;
		return 500000;
	};

	const scheduleUpdate = (key: string, handler: () => void) => {
		if (updateTimers[key]) {
			clearTimeout(updateTimers[key]);
		}
		updateTimers = {
			...updateTimers,
			[key]: setTimeout(handler, 350)
		};
	};

	const withLock = async (key: string, run: () => Promise<void>, showSpinner = false) => {
		if (updateLocks.has(key)) return;
		updateLocks.add(key);
		if (showSpinner) isUpdating = true;
		try {
			await run();
		} finally {
			updateLocks.delete(key);
			if (showSpinner) isUpdating = false;
		}
	};

	const unwrapActionPayload = (payload: unknown) => {
		if (payload && typeof payload === 'object' && 'data' in payload) {
			return (payload as { data?: Record<string, unknown> }).data ?? {};
		}
		return payload as Record<string, unknown>;
	};

	const toErrorMessage = (value: unknown, fallback: string) => {
		if (typeof value === 'string' && value.trim().length > 0) return value;
		if (value && typeof value === 'object') {
			const candidate =
				'value' in value && typeof (value as { value?: unknown }).value === 'string'
					? (value as { value: string }).value
					: 'message' in value && typeof (value as { message?: unknown }).message === 'string'
						? (value as { message: string }).message
						: '';
			if (candidate.trim().length > 0) return candidate;
		}
		return fallback;
	};

	const getPayloadErrorMessage = (payload: any, fallback: string) =>
		toErrorMessage(payload?.error ?? payload?.data?.error ?? payload?.message, fallback);

	const getThrownErrorMessage = (error: unknown, fallback: string) =>
		error instanceof Error ? toErrorMessage(error.message, fallback) : toErrorMessage(error, fallback);

	const applyReserveOrderOverrides = (rules: typeof autoFundingRules) => {
		const overrides = { ...reserveOrderOverridesByTarget };
		const normalized = (rules ?? []).map((rule) => ({ ...rule }));
		for (const [targetAccountId, orderedRuleIds] of Object.entries(overrides)) {
			const targetRules = normalized.filter((rule) => rule.target_account_id === targetAccountId);
			if (targetRules.length === 0 || orderedRuleIds.length !== targetRules.length) {
				delete overrides[targetAccountId];
				continue;
			}
			const targetRuleIds = new Set(targetRules.map((rule) => rule.id));
			if (orderedRuleIds.some((ruleId) => !targetRuleIds.has(ruleId))) {
				delete overrides[targetAccountId];
				continue;
			}
			const rulesById = new Map(targetRules.map((rule) => [rule.id, rule]));
			orderedRuleIds.forEach((ruleId, index) => {
				const matchingRule = rulesById.get(ruleId);
				if (matchingRule) {
					matchingRule.priority_order = index + 1;
				}
			});
		}
		reserveOrderOverridesByTarget = overrides;
		return normalized.sort(
			(a, b) =>
				a.target_account_id.localeCompare(b.target_account_id) ||
				a.priority_order - b.priority_order ||
				a.created_at.localeCompare(b.created_at)
		);
	};

	const setAutoFundingRules = (rules: typeof autoFundingRules) => {
		autoFundingRules = applyReserveOrderOverrides(rules ?? []);
	};

	const togglePnlNode = (id: string) => {
		const next = new Set(expandedPnlNodes);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedPnlNodes = next;
	};

	const refreshProjection = async (options?: { includeCashflows?: boolean; force?: boolean }) => {
		if (!autoRunProjection && !options?.force) {
			return;
		}
		const requestId = ++refreshProjectionRequestId;
		const url = new URL('/dashboard/projection', window.location.origin);
		url.searchParams.set('scenarioId', data.scenario.id);
		if (options?.includeCashflows) {
			url.searchParams.set('includeCashflows', 'true');
		}
		const response = await fetch(url, { cache: 'no-store' });
		if (!response.ok) {
			throw new Error('Unable to refresh the projection. Please try again.');
		}
		const payload = await response.json();
		if (requestId !== refreshProjectionRequestId) {
			return;
		}
		projectionData = payload.projection;
		if (payload.autoFundingRules) {
			setAutoFundingRules(payload.autoFundingRules);
		}
		if (payload.accountBalanceTargets) {
			accountBalanceTargets = [...payload.accountBalanceTargets];
		}
		if (payload.autoSweepRules) {
			autoSweepRules = [...payload.autoSweepRules];
		}
		if (payload.cashflows) {
			cashflows = [...payload.cashflows];
			syncCashflowAmounts(payload.cashflows);
		}
		sessionRates = payload.sessionRates;
		projectionRange = payload.projectionRange;
		projectionVersion += 1;
		projectionError = null;
	};

	const updateProjectionRange = async (range: typeof projectionRange) => {
		await withLock(
			'projectionRange',
			async () => {
				projectionRange = range;
				const formData = new FormData();
				formData.set('projectionRange', range);
				await fetch('?/updateRange', { method: 'POST', body: formData });
			}
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to refresh the projection.';
		});
	};

	const runProjectionNow = async () => {
		await withLock(
			'manualProjection',
			async () => {
				await refreshProjection({ includeCashflows: true, force: true });
			},
			true
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to refresh the projection.';
		});
	};

	const openLiquidityIncomeShortcut = () => {
		plannerLiquidityShortcutError = '';
		const personAsset = assetsList.find((asset) => asset.asset_type === 'person');
		if (!personAsset) {
			plannerLiquidityShortcutError = 'Add a person asset first so income can be modeled.';
			return;
		}
		assetPanelTab = 'assets';
		openCashflowForm(personAsset.id, 'income');
		const key = getDraftKey(personAsset.id, 'income');
		const existing = cashflowDrafts[key] ?? getDefaultDraft(personAsset.id, 'income', 'person');
		const deficitMonth = plannerFirstLiquidityDeficit?.startDate
			? monthLabelFromDate(plannerFirstLiquidityDeficit.startDate)
			: existing.startDate;
		const deficitAmount = plannerFirstLiquidityDeficit?.deficitAmount ?? 0;
		setCashflowDraft(key, {
			category: 'misc_income',
			frequency: 'monthly',
			startDate: deficitMonth,
			amount: deficitAmount > 0 ? String(Math.round(deficitAmount * 100) / 100) : existing.amount,
			description: existing.description || 'Liquidity support income'
		});
	};

	const openLiquidityExpenseShortcut = () => {
		plannerLiquidityShortcutError = '';
		let bestAssetId: string | null = null;
		let bestCashflow: (typeof cashflows)[number] | null = null;
		for (const asset of assetsList) {
			if (asset.asset_type !== 'person' && asset.asset_type !== 'property') continue;
			for (const cashflow of cashflowsByAssetId[asset.id] ?? []) {
				if (cashflow.cashflow_type !== 'expense') continue;
				if (!bestCashflow || cashflow.amount > bestCashflow.amount) {
					bestCashflow = cashflow;
					bestAssetId = asset.id;
				}
			}
		}
		assetPanelTab = 'assets';
		if (bestAssetId && bestCashflow) {
			openCashflowFormForEdit(bestAssetId, bestCashflow);
			return;
		}
		plannerLiquidityShortcutError =
			'No existing expense cashflows found. Add one first, then reduce it to improve liquidity.';
	};

	const openLiquidityTransferShortcut = () => {
		plannerLiquidityShortcutError = '';
		if (!plannerLiquiditySaleShortcut) {
			plannerLiquidityShortcutError =
				'No shares/super sale source is available for the first liquidity deficit month.';
			return;
		}
		assetPanelTab = 'transfers';
		transferFormError = '';
		transferInlineError = '';
		transferDraft = {
			sourceAccountId: plannerLiquiditySaleShortcut.sourceAccountId,
			destinationAccountId: plannerLiquiditySaleShortcut.targetAccountId,
			amount: String(plannerLiquiditySaleShortcut.amount),
			frequency: 'one_time',
			startDate: monthLabelFromDate(plannerLiquiditySaleShortcut.startDate),
			endDate: '',
			description: `Liquidity support transfer to ${plannerLiquiditySaleShortcut.targetAccountName}`,
			inflationAffected: false
		};
	};

	const openLiquidityPropertySaleShortcut = () => {
		plannerLiquidityShortcutError = '';
		const property = assetsList.find((asset) => asset.asset_type === 'property');
		if (!property) {
			plannerLiquidityShortcutError = 'No property asset found to schedule a sale.';
			return;
		}
		const saleDate = plannerFirstLiquidityDeficit?.startDate
			? monthLabelFromDate(plannerFirstLiquidityDeficit.startDate)
			: '';
		const current = propertyDetails[property.id] ?? {
			name: property.name ?? '',
			startDate: formatYearMonthInput(property.start_date),
			marketValue: Number(property.details?.marketValue ?? 0) || 0,
			marketGrowthRate: Number(property.details?.marketGrowthRate ?? 0) || 0,
			saleDate: '',
			fixedSellingCosts: Number(property.details?.fixedSellingCosts ?? 0) || 0,
			variableSellingCosts: Number(property.details?.variableSellingCosts ?? 0) || 0
		};
		assetPanelTab = 'assets';
		expandedPropertyDetailIds = new Set([...expandedPropertyDetailIds, property.id]);
		setPropertyDetails(property.id, { ...current, saleDate });
	};

	const jumpToWhatIfAssetsExpense = async () => {
		assetPanelTab = 'assets';
		const firstPerson = assetsList.find((asset) => asset.asset_type === 'person');
		const firstExpense = firstPerson
			? (cashflowsByAssetId[firstPerson.id] ?? []).find(
					(cashflow) => cashflow.cashflow_type === 'expense'
				)
			: null;

		await tick();

		whatIfPanelElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (firstExpense) {
			const targetInput = document.getElementById(
				`cashflow-input-${firstExpense.id}`
			) as HTMLInputElement | null;
			targetInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetInput?.focus({ preventScroll: true });
			try {
				targetInput?.select();
			} catch {
				// Some input types may not support text selection.
			}
		}
	};

	const saveAutoFundingRule = async () => {
		if (!stage2AllocationShortfall) return;
		if (!plannerSourceAccountId) {
			autoFundingRuleError = 'Select a source account.';
			return;
		}

		await withLock(
			`auto-funding-save:${stage2AllocationShortfall.targetAccountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('targetAccountId', stage2AllocationShortfall.targetAccountId);
				formData.set('sourceAccountId', plannerSourceAccountId);
				const response = await fetch('?/upsertAutoFundingRule', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					let message = 'Unable to save auto-funding rule.';
					try {
						const payload = await response.json();
						message = payload?.error ?? payload?.data?.error ?? payload?.message ?? message;
					} catch {
						// ignore parse errors and keep default message
					}
					throw new Error(message);
				}
				const payload = await response.json();
				if (payload?.autoFundingRules) {
					setAutoFundingRules(payload.autoFundingRules);
				}
				plannerSourceAccountId = '';
				autoFundingRuleError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			autoFundingRuleError =
				error instanceof Error ? error.message : 'Unable to save auto-funding rule.';
			projectionError = autoFundingRuleError;
		});
	};

	const removeAutoFundingRule = async (ruleId: string) => {
		await withLock(
			`auto-funding-delete:${ruleId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('ruleId', ruleId);
				const response = await fetch('?/deleteAutoFundingRule', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					let message = 'Unable to remove auto-funding rule.';
					try {
						const payload = await response.json();
						message = payload?.error ?? payload?.data?.error ?? payload?.message ?? message;
					} catch {
						// ignore parse errors and keep default message
					}
					throw new Error(message);
				}
				const payload = await response.json();
				if (payload?.autoFundingRules) {
					setAutoFundingRules(payload.autoFundingRules);
				}
				autoFundingRuleError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			autoFundingRuleError =
				error instanceof Error ? error.message : 'Unable to remove auto-funding rule.';
			projectionError = autoFundingRuleError;
		});
	};

	const jumpToWhatIfReserves = async () => {
		assetPanelTab = 'reserves';
		const firstCashAccountId = fundingCashAccountOptions[0]?.id ?? '';
		await tick();
		whatIfPanelElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (!firstCashAccountId) return;
		const targetInput = document.getElementById(
			`reserve-amount-input-${firstCashAccountId}`
		) as HTMLInputElement | null;
		targetInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		targetInput?.focus({ preventScroll: true });
		try {
			targetInput?.select();
		} catch {
			// Number inputs may not support text selection across browsers.
		}
	};

	const jumpToWhatIfCaps = async () => {
		assetPanelTab = 'caps';
		const firstCashAccountId = fundingCashAccountOptions[0]?.id ?? '';
		await tick();
		whatIfPanelElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		if (!firstCashAccountId) return;
		const targetInput = document.getElementById(
			`cap-amount-input-${firstCashAccountId}`
		) as HTMLInputElement | null;
		targetInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		targetInput?.focus({ preventScroll: true });
		try {
			targetInput?.select();
		} catch {
			// Number inputs may not support text selection across browsers.
		}
	};

	const getFundingTarget = (accountId: string) =>
		accountBalanceTargets.find((item) => item.account_id === accountId && item.enabled) ?? null;

	const getReserveRulesForTarget = (targetAccountId: string) =>
		autoFundingRules
			.filter((rule) => rule.target_account_id === targetAccountId)
			.sort((a, b) => a.priority_order - b.priority_order);

	const getSweepRulesForSource = (sourceAccountId: string) =>
		autoSweepRules
			.filter((rule) => rule.source_account_id === sourceAccountId)
			.sort((a, b) => a.priority_order - b.priority_order);

	const upsertFundingTargetForAccount = async (accountId: string) => {
		const minBalance = Number(fundingReserveDrafts[accountId] ?? '0');
		const maxRaw = (fundingCapDrafts[accountId] ?? '').trim();
		const maxBalance = maxRaw.length > 0 ? Number(maxRaw) : null;
		if (!Number.isFinite(minBalance) || minBalance < 0) {
			fundingTabError = 'Reserve must be a number greater than or equal to 0.';
			return;
		}
		if (maxBalance !== null && (!Number.isFinite(maxBalance) || maxBalance < 0)) {
			fundingTabError = 'Cap must be blank or a number greater than or equal to 0.';
			return;
		}
		if (maxBalance !== null && maxBalance < minBalance) {
			fundingTabError = 'Cap must be greater than or equal to reserve.';
			return;
		}
		await withLock(
			`funding-target-save:${accountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('accountId', accountId);
				formData.set('minBalance', String(minBalance));
				formData.set('maxBalance', maxRaw);
				const response = await fetch('?/updateAccountBalanceTarget', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload?.error ?? 'Unable to save reserve/cap.');
				}
				const payload = unwrapActionPayload(await response.json());
				if (Array.isArray(payload?.accountBalanceTargets)) {
					accountBalanceTargets = [...payload.accountBalanceTargets];
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			fundingTabError = error instanceof Error ? error.message : 'Unable to save reserve/cap.';
		});
	};

	const addReserveRuleForTarget = async (targetAccountId: string, selectedSourceAccountId: string) => {
		const sourceAccountId = selectedSourceAccountId;
		if (!sourceAccountId) {
			fundingTabError = 'Select a reserve funding source account.';
			return;
		}
		await withLock(
			`funding-reserve-add:${targetAccountId}`,
			async () => {
				const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
				const currentRules = getReserveRulesForTarget(targetAccountId);
				setAutoFundingRules([
					...autoFundingRules,
					{
						id: optimisticId,
						scenario_id: data.scenario.id,
						source_account_id: sourceAccountId,
						target_account_id: targetAccountId,
						priority_order: currentRules.length + 1,
						enabled: true,
						min_target_balance: 0,
						created_at: '',
						updated_at: ''
					}
				]);
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('targetAccountId', targetAccountId);
				formData.set('sourceAccountId', sourceAccountId);
				const response = await fetch('?/upsertAutoFundingRule', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(getPayloadErrorMessage(payload, 'Unable to add reserve funding rule.'));
				}
				const payload = unwrapActionPayload(await response.json());
				if (Array.isArray(payload?.autoFundingRules)) {
					setAutoFundingRules(payload.autoFundingRules);
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			fundingTabError = getThrownErrorMessage(error, 'Unable to add reserve funding rule.');
		});
	};

	const removeReserveRule = async (ruleId: string) => {
		const previousRules = [...autoFundingRules];
		setAutoFundingRules(autoFundingRules.filter((rule) => rule.id !== ruleId));
		await withLock(
			`funding-reserve-delete:${ruleId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('ruleId', ruleId);
				const response = await fetch('?/deleteAutoFundingRule', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(getPayloadErrorMessage(payload, 'Unable to delete reserve funding rule.'));
				}
				const payload = unwrapActionPayload(await response.json());
				if (Array.isArray(payload?.autoFundingRules)) {
					setAutoFundingRules(payload.autoFundingRules);
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			setAutoFundingRules(previousRules);
			fundingTabError = getThrownErrorMessage(error, 'Unable to delete reserve funding rule.');
		});
	};

	const moveReserveRule = async (targetAccountId: string, ruleId: string, direction: -1 | 1) => {
		const rules = getReserveRulesForTarget(targetAccountId);
		const index = rules.findIndex((rule) => rule.id === ruleId);
		if (index < 0) return;
		const swapIndex = index + direction;
		if (swapIndex < 0 || swapIndex >= rules.length) return;
		const reordered = [...rules];
		const [moved] = reordered.splice(index, 1);
		reordered.splice(swapIndex, 0, moved);
		const reorderedIds = reordered.map((rule) => rule.id);
		await withLock(
			`funding-reserve-move:${targetAccountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('targetAccountId', targetAccountId);
				formData.set('ruleIds', reordered.map((rule) => rule.id).join(','));
				const response = await fetch('?/reorderAutoFundingRules', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(getPayloadErrorMessage(payload, 'Unable to reorder reserve funding rules.'));
				}
				const payload = unwrapActionPayload(await response.json());
				reserveOrderOverridesByTarget = {
					...reserveOrderOverridesByTarget,
					[targetAccountId]: reorderedIds
				};
				if (Array.isArray(payload?.autoFundingRules)) {
					setAutoFundingRules(payload.autoFundingRules);
				} else {
					setAutoFundingRules(
						autoFundingRules.map((rule) => {
						if (rule.target_account_id !== targetAccountId) return rule;
						const nextIndex = reorderedIds.indexOf(rule.id);
						return nextIndex < 0 ? rule : { ...rule, priority_order: nextIndex + 1 };
						})
					);
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			fundingTabError = getThrownErrorMessage(error, 'Unable to reorder reserve funding rules.');
		});
	};

	const addSweepRuleForSource = async (
		sourceAccountId: string,
		selectedDestinationAccountId: string
	) => {
		const destinationAccountId = selectedDestinationAccountId;
		if (!destinationAccountId) {
			fundingTabError = 'Select an auto-sweep destination account.';
			return;
		}
		await withLock(
			`funding-sweep-add:${sourceAccountId}`,
			async () => {
				const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
				const currentRules = getSweepRulesForSource(sourceAccountId);
				autoSweepRules = [
					...autoSweepRules,
					{
						id: optimisticId,
						scenario_id: data.scenario.id,
						source_account_id: sourceAccountId,
						destination_account_id: destinationAccountId,
						priority_order: currentRules.length + 1,
						enabled: true,
						created_at: '',
						updated_at: ''
					}
				];
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('sourceAccountId', sourceAccountId);
				formData.set('destinationAccountId', destinationAccountId);
				const response = await fetch('?/upsertAutoSweepRule', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(
						payload?.error ?? payload?.data?.error ?? 'Unable to add auto-sweep rule.'
					);
				}
				const payload = unwrapActionPayload(await response.json());
				if (Array.isArray(payload?.autoSweepRules)) {
					autoSweepRules = [...payload.autoSweepRules];
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			fundingTabError = error instanceof Error ? error.message : 'Unable to add auto-sweep rule.';
		});
	};

	const removeSweepRule = async (ruleId: string) => {
		const previousRules = [...autoSweepRules];
		autoSweepRules = autoSweepRules.filter((rule) => rule.id !== ruleId);
		await withLock(
			`funding-sweep-delete:${ruleId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('ruleId', ruleId);
				const response = await fetch('?/deleteAutoSweepRule', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(
						payload?.error ?? payload?.data?.error ?? 'Unable to delete auto-sweep rule.'
					);
				}
				const payload = unwrapActionPayload(await response.json());
				if (Array.isArray(payload?.autoSweepRules)) {
					autoSweepRules = [...payload.autoSweepRules];
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			autoSweepRules = previousRules;
			fundingTabError =
				error instanceof Error ? error.message : 'Unable to delete auto-sweep rule.';
		});
	};

	const moveSweepRule = async (sourceAccountId: string, ruleId: string, direction: -1 | 1) => {
		const rules = getSweepRulesForSource(sourceAccountId);
		const index = rules.findIndex((rule) => rule.id === ruleId);
		if (index < 0) return;
		const swapIndex = index + direction;
		if (swapIndex < 0 || swapIndex >= rules.length) return;
		const reordered = [...rules];
		const [moved] = reordered.splice(index, 1);
		reordered.splice(swapIndex, 0, moved);
		const reorderedIds = reordered.map((rule) => rule.id);
		autoSweepRules = autoSweepRules.map((rule) => {
			if (rule.source_account_id !== sourceAccountId) return rule;
			const nextIndex = reorderedIds.indexOf(rule.id);
			return nextIndex < 0 ? rule : { ...rule, priority_order: nextIndex + 1 };
		});
		await withLock(
			`funding-sweep-move:${sourceAccountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('sourceAccountId', sourceAccountId);
				formData.set('ruleIds', reordered.map((rule) => rule.id).join(','));
				const response = await fetch('?/reorderAutoSweepRules', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(
						payload?.error ?? payload?.data?.error ?? 'Unable to reorder auto-sweep rules.'
					);
				}
				const payload = unwrapActionPayload(await response.json());
				if (Array.isArray(payload?.autoSweepRules)) {
					autoSweepRules = [...payload.autoSweepRules];
				}
				fundingTabError = '';
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			fundingTabError =
				error instanceof Error ? error.message : 'Unable to reorder auto-sweep rules.';
		});
	};

	const updateRetirementAge = async (assetId: string, retirementAge: number) => {
		await withLock(
			`retirement:${assetId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('retirementAge', String(retirementAge));
				const response = await fetch('?/updateRetirementAge', { method: 'POST', body: formData });
				if (!response.ok) {
					throw new Error('Unable to update retirement age. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError = error instanceof Error ? error.message : 'Unable to update retirement age.';
		});
	};

	const updatePersonDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		dob: string
	) => {
		await withLock(
			`person-details:${assetId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('name', name);
				formData.set('startDate', startDate);
				formData.set('dob', dob);
				const response = await fetch('?/updatePersonDetails', { method: 'POST', body: formData });
				if (!response.ok) {
					throw new Error('Unable to update person details. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError = error instanceof Error ? error.message : 'Unable to update person details.';
		});
	};

	const updateCashflowAmount = async (cashflowId: string, amount: number) => {
		await withLock(
			`cashflow:${cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('cashflowId', cashflowId);
				formData.set('amount', String(amount));
				const response = await fetch('?/updateCashflowAmount', { method: 'POST', body: formData });
				if (!response.ok) {
					throw new Error('Unable to update cashflow amount. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to update cashflow amount.';
		});
	};

	const createAssetCashflow = async (assetId: string, draft: CashflowDraft) => {
		await withLock(
			`createCashflow:${assetId}`,
			async () => {
				let hasCashflows = false;
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('type', draft.type);
				formData.set('category', draft.category);
				formData.set('frequency', draft.frequency);
				formData.set('amount', draft.amount);
				formData.set('description', draft.description);
				formData.set('startDate', draft.startDate);
				formData.set('endDate', draft.endDate);
				if (draft.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				formData.set('assetAccountId', draft.assetAccountId);
				const response = await fetch('?/createCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to create cashflow. Please check the form.');
				}
				try {
					const payload = await response.json();
					const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
					if (nextCashflows) {
						cashflows = [...nextCashflows];
						syncCashflowAmounts(nextCashflows);
						hasCashflows = true;
					}
				} catch {
					// ignore JSON parse issues; refreshProjection will sync state
				}
				await refreshProjection({ includeCashflows: !hasCashflows });
				const draftKey = getDraftKey(assetId, draft.type);
				const assetType = getAssetType(assetId);
				cashflowDrafts = {
					...cashflowDrafts,
					[draftKey]: getDefaultDraft(assetId, draft.type, assetType)
				};
				cashflowFormErrors = { ...cashflowFormErrors, [assetId]: '' };
				activeCashflowForm = null;
			},
			autoRunProjection
		).catch((error) => {
			cashflowFormErrors = {
				...cashflowFormErrors,
				[assetId]: error instanceof Error ? error.message : 'Unable to create cashflow.'
			};
			projectionError = error instanceof Error ? error.message : 'Unable to create cashflow.';
		});
	};

	const updateAssetCashflow = async (assetId: string, cashflowId: string, draft: CashflowDraft) => {
		await withLock(
			`updateCashflow:${cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('cashflowId', cashflowId);
				formData.set('type', draft.type);
				formData.set('category', draft.category);
				formData.set('frequency', draft.frequency);
				formData.set('amount', draft.amount);
				formData.set('description', draft.description);
				formData.set('startDate', draft.startDate);
				formData.set('endDate', draft.endDate);
				if (draft.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				formData.set('assetAccountId', draft.assetAccountId);
				const response = await fetch('?/updateCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to update cashflow. Please try again.');
				}
				const payload = await response.json();
				const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
				if (nextCashflows) {
					cashflows = [...nextCashflows];
					syncCashflowAmounts(nextCashflows);
				} else {
					await refreshProjection({ includeCashflows: true });
				}
				cashflowFormErrors = { ...cashflowFormErrors, [assetId]: '' };
				activeCashflowForm = null;
			},
			autoRunProjection
		).catch((error) => {
			cashflowFormErrors = {
				...cashflowFormErrors,
				[assetId]: error instanceof Error ? error.message : 'Unable to update cashflow.'
			};
			projectionError = error instanceof Error ? error.message : 'Unable to update cashflow.';
		});
	};

	const createTransferCashflow = async () => {
		const draft = transferDraft;
		if (
			!draft.sourceAccountId ||
			!draft.destinationAccountId ||
			draft.sourceAccountId === draft.destinationAccountId ||
			!draft.amount.trim() ||
			!isValidMonthYear(draft.startDate) ||
			(draft.endDate.trim().length > 0 && !isValidMonthYear(draft.endDate))
		) {
			transferFormError =
				'Choose different source and destination accounts, use a valid amount, and use MM YYYY dates.';
			return;
		}
		const amountValue = Number(draft.amount);
		if (!Number.isFinite(amountValue) || amountValue <= 0) {
			transferFormError = 'Amount must be greater than 0.';
			return;
		}

		await withLock(
			'createTransferCashflow',
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('sourceAccountId', draft.sourceAccountId);
				formData.set('destinationAccountId', draft.destinationAccountId);
				formData.set('amount', String(amountValue));
				formData.set('frequency', draft.frequency);
				formData.set('startDate', draft.startDate);
				formData.set('endDate', draft.endDate);
				formData.set('description', draft.description.trim());
				if (draft.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				const response = await fetch('?/createTransferCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					let message = 'Unable to create transfer. Please check the form.';
					try {
						const payload = await response.json();
						message = payload?.error ?? payload?.data?.error ?? payload?.message ?? message;
					} catch {
						// Fall back to generic message when response body is not JSON.
					}
					throw new Error(message);
				}
				const payload = await response.json();
				const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
				if (nextCashflows) {
					cashflows = [...nextCashflows];
					syncCashflowAmounts(nextCashflows);
				} else {
					await refreshProjection({ includeCashflows: true });
				}
				transferFormError = '';
				transferDraft = {
					...transferDraft,
					amount: '',
					description: '',
					endDate: ''
				};
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			transferFormError = error instanceof Error ? error.message : 'Unable to create transfer.';
			projectionError = error instanceof Error ? error.message : 'Unable to create transfer.';
		});
	};

	const updateTransferInflationAffected = async (
		cashflowId: string,
		inflationAffected: boolean
	) => {
		await withLock(
			`transfer-inflation:${cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('cashflowId', cashflowId);
				if (inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				const response = await fetch('?/updateTransferInflationAffected', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to update transfer inflation setting.');
				}
				const payload = await response.json();
				const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
				if (nextCashflows) {
					cashflows = [...nextCashflows];
					syncCashflowAmounts(nextCashflows);
				}
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to update transfer inflation setting.';
		});
	};

	const setTransferEditDraft = (
		cashflowId: string,
		updates: Partial<{
			sourceAccountId: string;
			destinationAccountId: string;
			amount: string;
			frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
			startDate: string;
			endDate: string;
			description: string;
		}>
	) => {
		transferEditDrafts = {
			...transferEditDrafts,
			[cashflowId]: { ...transferEditDrafts[cashflowId], ...updates }
		};
	};

	const saveTransferEditDraft = async (cashflowId: string) => {
		const draft = transferEditDrafts[cashflowId];
		if (!draft) return;
		const amountValue = Number(draft.amount);
		if (
			!draft.sourceAccountId ||
			!draft.destinationAccountId ||
			draft.sourceAccountId === draft.destinationAccountId
		) {
			transferInlineError = 'Choose different source and destination accounts.';
			return;
		}
		if (!Number.isFinite(amountValue) || amountValue <= 0) {
			transferInlineError = 'Transfer amount must be greater than 0.';
			return;
		}
		if (!isValidMonthYear(draft.startDate)) {
			transferInlineError = 'Transfer start date must use MM YYYY.';
			return;
		}
		if (
			draft.frequency !== 'one_time' &&
			draft.endDate.trim() &&
			!isValidMonthYear(draft.endDate)
		) {
			transferInlineError = 'Transfer end date must use MM YYYY.';
			return;
		}

		await withLock(
			`transfer-edit:${cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('cashflowId', cashflowId);
				formData.set('sourceAccountId', draft.sourceAccountId);
				formData.set('destinationAccountId', draft.destinationAccountId);
				formData.set('amount', String(amountValue));
				formData.set('frequency', draft.frequency);
				formData.set('startDate', draft.startDate);
				formData.set('endDate', draft.frequency === 'one_time' ? '' : draft.endDate);
				formData.set('description', draft.description.trim());
				const response = await fetch('?/updateTransferCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to update transfer.');
				}
				const payload = await response.json();
				const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
				if (nextCashflows) {
					cashflows = [...nextCashflows];
					syncCashflowAmounts(nextCashflows);
					const refreshedTransfer = (nextCashflows as typeof cashflows).find(
						(item) => item.id === cashflowId
					);
					if (refreshedTransfer) {
						setTransferEditDraft(cashflowId, {
							sourceAccountId: refreshedTransfer.source_account_id ?? '',
							destinationAccountId: refreshedTransfer.destination_account_id ?? '',
							amount: String(refreshedTransfer.amount ?? ''),
							frequency: refreshedTransfer.frequency,
							startDate: toMonthYearInput(refreshedTransfer.start_date),
							endDate: refreshedTransfer.end_date
								? toMonthYearInput(refreshedTransfer.end_date)
								: '',
							description: refreshedTransfer.description ?? ''
						});
					}
				}
				transferInlineError = '';
				await refreshProjection({ includeCashflows: true });
			},
			autoRunProjection
		).catch((error) => {
			transferInlineError = error instanceof Error ? error.message : 'Unable to update transfer.';
			projectionError = transferInlineError;
		});
	};

	const setAccountEditDraft = (
		accountId: string,
		updates: Partial<{
			startDate: string;
			name: string;
			openingBalance: string;
		}>
	) => {
		accountEditDrafts = {
			...accountEditDrafts,
			[accountId]: { ...accountEditDrafts[accountId], ...updates }
		};
	};

	const saveAccountEditDraft = async (accountId: string) => {
		const draft = accountEditDrafts[accountId];
		if (!draft) return;
		const name = draft.name.trim();
		const openingBalance = Number(draft.openingBalance);
		const normalizedStartDate = normalizeYearMonthValue(draft.startDate);
		if (!name) {
			accountInlineError = 'Account name is required.';
			return;
		}
		if (!isValidMonthYear(draft.startDate) || normalizedStartDate === null) {
			accountInlineError = 'Account start date must use MM YYYY.';
			return;
		}
		if (!Number.isFinite(openingBalance)) {
			accountInlineError = 'Opening balance must be a valid number.';
			return;
		}
		await withLock(
			`account-edit:${accountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('accountId', accountId);
				formData.set('name', name);
				formData.set('startDate', draft.startDate);
				formData.set('openingBalance', String(openingBalance));
				const response = await fetch('?/updateAccountDetails', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to update account details.');
				}
				const roundedOpeningBalance = roundToTwo(openingBalance);
				accountsList = accountsList.map((account) =>
					account.id === accountId
						? {
								...account,
								name,
								start_date: normalizedStartDate,
								opening_balance: roundedOpeningBalance
							}
						: account
				);
				setAccountEditDraft(accountId, {
					name,
					startDate: toMonthYearInput(normalizedStartDate),
					openingBalance: String(roundedOpeningBalance)
				});
				accountInlineError = '';
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			accountInlineError =
				error instanceof Error ? error.message : 'Unable to update account details.';
			projectionError = accountInlineError;
		});
	};

	const requestDeleteCashflow = (cashflowId: string) => {
		deleteConfirmId = cashflowId;
	};

	const cancelDeleteCashflow = () => {
		deleteConfirmId = null;
	};

	const confirmDeleteCashflow = async () => {
		const cashflowId = deleteConfirmId;
		if (!cashflowId) return;
		deleteConfirmId = null;
		await withLock(
			`deleteCashflow:${cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('cashflowId', cashflowId);
				const response = await fetch('?/deleteCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to delete cashflow. Please try again.');
				}
				const payload = await response.json();
				const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
				if (nextCashflows) {
					cashflows = [...nextCashflows];
					syncCashflowAmounts(nextCashflows);
				} else {
					await refreshProjection({ includeCashflows: true });
				}
				deleteConfirmId = null;
			},
			autoRunProjection
		).catch((error) => {
			projectionError = error instanceof Error ? error.message : 'Unable to delete cashflow.';
		});
	};

	const updatePropertyDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		marketValue: number,
		marketGrowthRate: number,
		saleDate: string,
		fixedSellingCosts: number,
		variableSellingCosts: number
	) => {
		await withLock(
			`property:${assetId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('name', name);
				formData.set('startDate', startDate);
				formData.set('marketValue', String(marketValue));
				formData.set('marketGrowthRate', String(marketGrowthRate));
				formData.set('saleDate', saleDate);
				formData.set('fixedSellingCosts', String(fixedSellingCosts));
				formData.set('variableSellingCosts', String(variableSellingCosts));
				const response = await fetch('?/updatePropertyDetails', {
					method: 'POST',
					body: formData
				});
				if (!response.ok) {
					throw new Error('Unable to update property details. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to update property details.';
		});
	};

	const updateShareDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		capitalGrowthRate: number,
		dividendYield: number,
		dividendsTakenAsIncomeDate: string
	) => {
		await withLock(
			`shares:${assetId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('name', name);
				formData.set('startDate', startDate);
				formData.set('capitalGrowthRate', String(capitalGrowthRate));
				formData.set('dividendYield', String(dividendYield));
				formData.set('dividendsTakenAsIncomeDate', dividendsTakenAsIncomeDate);
				const response = await fetch('?/updateShareDetails', {
					method: 'POST',
					body: formData
				});
				if (!response.ok) {
					throw new Error('Unable to update shares details. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError = error instanceof Error ? error.message : 'Unable to update shares details.';
		});
	};

	const updateAccountInterestRate = async (accountId: string, interestRate: number) => {
		await withLock(
			`account:${accountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('accountId', accountId);
				formData.set('interestRate', String(interestRate));
				const response = await fetch('?/updateAccountInterestRate', {
					method: 'POST',
					body: formData
				});
				if (!response.ok) {
					throw new Error('Unable to update account interest rate. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to update account interest rate.';
		});
	};

	const updateMortgageDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		termYears: number,
		termMonths: number,
		mortgageAccountName: string,
		openingBalance: number
	) => {
		await withLock(
			`mortgage:${assetId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', data.scenario.id);
				formData.set('assetId', assetId);
				formData.set('name', name);
				formData.set('startDate', startDate);
				formData.set('termYears', String(termYears));
				formData.set('termMonths', String(termMonths));
				formData.set('mortgageAccountName', mortgageAccountName);
				formData.set('openingBalance', String(openingBalance));
				const response = await fetch('?/updateMortgageDetails', { method: 'POST', body: formData });
				if (!response.ok) {
					throw new Error('Unable to update mortgage details. Please try again.');
				}
				await refreshProjection();
			},
			autoRunProjection
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to update mortgage details.';
		});
	};

	const persistSessionRates = async () => {
		await withLock(
			'updateInflationRate',
			async () => {
				const formData = new FormData();
				formData.set('inflationRate', String(sessionRates.inflationRate));
				formData.set('deltaInflation', '0');
				await fetch('?/updateInflationRate', { method: 'POST', body: formData });
				await refreshProjection({ force: true });
			},
			true
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to refresh the projection.';
		});
	};

	const queueInflationRateChange = (delta: number) => {
		const current = Number.isFinite(sessionRates.inflationRate) ? sessionRates.inflationRate : 2;
		const next = Math.round((current + delta) * 10) / 10;
		sessionRates = { ...sessionRates, inflationRate: next };
		scheduleUpdate('updateInflationRate', () => {
			persistSessionRates();
		});
	};

	const parseYearMonth = (value: unknown) => {
		const normalized = normalizeYearMonthValue(value);
		return normalized === null ? null : fromYearMonthInt(normalized);
	};

	const getRangeMonths = (range: ProjectionRange) => {
		switch (range) {
			case '1y':
				return 12;
			case '5y':
				return 60;
			case '10y':
				return 120;
			default:
				return null;
		}
	};

	const getRangeEndDate = (startDate: number, range: ProjectionRange) => {
		const months = getRangeMonths(range);
		if (!months) return null;
		const start = fromYearMonthInt(startDate);
		if (!start) return null;
		return toYearMonthInt(addMonthsToYearMonth(start, months - 1));
	};

	$: projectionRangeEndDate = getRangeEndDate(projectionData.startDate, projectionRange);

	const clipSeriesPointsByRange = <
		T extends {
			date: number;
		}
	>(
		points: T[]
	) => {
		if (projectionRangeEndDate === null) return points;
		return points.filter((point) => point.date <= projectionRangeEndDate);
	};

	const clipTransactionsByRange = (transactions: typeof projectionData.transactions) => {
		if (projectionRangeEndDate === null) return transactions;
		return transactions.filter((transaction) => transaction.date <= projectionRangeEndDate);
	};

	type ChartPoint = { date: number; monthLabel: string; balance: number };
	type ChartSeries = { id: string; name: string; points: ChartPoint[] };

	const getBalanceExtent = (seriesList: ChartSeries[]) => {
		const values = seriesList.flatMap((series) => series.points.map((point) => point.balance));
		if (!values.length) {
			return { min: 0, max: 1 };
		}
		const min = Math.min(...values, 0);
		const max = Math.max(...values, 0);
		return { min, max: max === min ? min + 1 : max };
	};

	const normalizeAccountSeries = (series: {
		accountId: string;
		accountName: string;
		points: any[];
	}) => ({
		id: series.accountId,
		name: series.accountName,
		points: (series.points ?? []).map((point) => ({
			date: point.date,
			monthLabel: point.monthLabel,
			balance: point.balance
		}))
	});

	const normalizeAssetSeries = (series: { assetId: string; assetName: string; points: any[] }) => ({
		id: series.assetId,
		name: series.assetName,
		points: (series.points ?? []).map((point) => ({
			date: point.date,
			monthLabel: point.monthLabel,
			balance: point.value
		}))
	});

	$: chartProjection = (() => {
		const accountSeries = (projectionData.accounts ?? [])
			.filter((series) => {
				const account = accountsList.find((item) => item.id === series.accountId);
				return account?.account_type !== 'brokerage' && account?.account_type !== 'super_account';
			})
			.map(normalizeAccountSeries);
		const assetSeries = (projectionData.assets ?? []).map(normalizeAssetSeries);
		const activeSeries =
			projectionBalanceSource === 'assets'
				? assetSeries
				: projectionBalanceSource === 'liquidity'
					? (() => {
							const liquiditySeries = (projectionData.liquidity?.series ?? []).map((series) => ({
								id: series.id,
								name: series.name,
								points: (series.points ?? []).map((point) => ({
									date: point.date,
									monthLabel: point.monthLabel,
									balance: point.balance
								}))
							}));
							if (liquiditySeries.length > 0) {
								return liquiditySeries as ChartSeries[];
							}
							return [
								{
									id: 'liquidity',
									name: 'Liquidity',
									points: (projectionData.liquidity?.points ?? []).map((point) => ({
										date: point.date,
										monthLabel: point.monthLabel,
										balance: point.balance
									}))
								}
							] as ChartSeries[];
						})()
					: projectionBalanceSource === 'net_worth'
						? ([...accountSeries, ...assetSeries] as ChartSeries[])
						: accountSeries;

		if (projectionRange === '10y' || projectionRange === 'all') {
			return {
				series: activeSeries.map((series) => ({
					...series,
					points: getAnnualPoints(clipSeriesPointsByRange(series.points))
				})),
				transactions: clipTransactionsByRange(projectionData.transactions ?? [])
			};
		}
		return {
			series: activeSeries.map((series) => ({
				...series,
				points: clipSeriesPointsByRange(series.points)
			})),
			transactions: clipTransactionsByRange(projectionData.transactions ?? [])
		};
	})();
	$: totalSeries = (() => {
		const seriesList = chartProjection.series ?? [];
		if (!seriesList.length) return null;
		const maxPoints = Math.max(...seriesList.map((series) => series.points.length));
		if (maxPoints === 0) return null;
		const points = Array.from({ length: maxPoints }).map((_, index) => {
			const sample = seriesList[0]?.points[index];
			const balance = seriesList.reduce(
				(sum, series) => sum + (series.points[index]?.balance ?? 0),
				0
			);
			return {
				date: sample?.date ?? '',
				monthLabel: sample?.monthLabel ?? '',
				balance
			};
		});
		return {
			accountId: 'total',
			accountName: 'Total',
			points
		};
	})();
	$: balanceExtent = getBalanceExtent(
		totalSeries
			? [...chartProjection.series, normalizeAccountSeries(totalSeries)]
			: chartProjection.series
	);
	$: chartAxisPoints = (() => {
		const basePoints = chartProjection.series[0]?.points ?? [];
		return basePoints.map((point) => ({
			date: point.date,
			monthLabel:
				projectionRange === '10y' || projectionRange === 'all'
					? String(fromYearMonthInt(point.date)?.year ?? '')
					: point.monthLabel
		}));
	})();

	$: balanceSheetHeaders = chartAxisPoints.map((point) => point.monthLabel);
	$: balanceSheetRows = (() => {
		const seriesList = chartProjection.series ?? [];
		if (seriesList.length === 0) return [];
		const rows = [];
		if (totalSeries) {
			rows.push({
				name: 'Total',
				values: totalSeries.points.map((point) => point.balance)
			});
		}
		for (const series of seriesList) {
			rows.push({
				name: series.name,
				values: series.points.map((point) => point.balance)
			});
		}
		return rows;
	})();

	type PnlNode = {
		id: string;
		label: string;
		level: number;
		values: number[];
		children?: PnlNode[];
	};

	const sumArrays = (arrays: number[][], length: number) => {
		const totals = Array(length).fill(0);
		for (const arr of arrays) {
			arr.forEach((value, idx) => {
				const safeValue = Number.isFinite(value) ? value : 0;
				totals[idx] += safeValue;
			});
		}
		return totals;
	};

	$: profitLossTree = (() => {
		if (chartProjection.transactions.length === 0) return [];
		const headers = chartAxisPoints.map((point) => point.monthLabel);
		const indexByLabel = new Map<string, number>();
		headers.forEach((label, index) => indexByLabel.set(label, index));

		const buildMaps = () => new Map<string, Map<string, Map<string, number[]>>>();
		const incomeMap = buildMaps();
		const expenseMap = buildMaps();

		for (const transaction of chartProjection.transactions) {
			if (transaction.cashflowType === 'transfer') continue;
			const label =
				projectionRange === '10y' || projectionRange === 'all'
					? String(fromYearMonthInt(transaction.date)?.year ?? '')
					: transaction.monthLabel;
			const idx = indexByLabel.get(label);
			if (idx === undefined) continue;

			const targetMap = transaction.cashflowType === 'income' ? incomeMap : expenseMap;
			const accountName = transaction.accountName;
			const category = formatLabel(transaction.category);
			const description = (transaction.description ?? '').trim();

			const categoryMap = targetMap.get(accountName) ?? new Map<string, Map<string, number[]>>();
			const descMap = categoryMap.get(category) ?? new Map<string, number[]>();
			const values = descMap.get(description) ?? Array(headers.length).fill(0);

			values[idx] += transaction.amount;
			descMap.set(description, values);
			categoryMap.set(category, descMap);
			targetMap.set(accountName, categoryMap);
		}

		const buildAccountNodes = (map: Map<string, Map<string, Map<string, number[]>>>) => {
			const nodes: PnlNode[] = [];
			const sortedAccounts = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
			for (const accountName of sortedAccounts) {
				const categoryMap = map.get(accountName)!;
				const categoryNodes: PnlNode[] = [];
				const categoryTotals: number[][] = [];

				for (const category of Array.from(categoryMap.keys()).sort((a, b) => a.localeCompare(b))) {
					const descMap = categoryMap.get(category)!;
					const descNodes: PnlNode[] = [];
					const descTotals: number[][] = [];
					const noDescriptionTotals: number[] = Array(headers.length).fill(0);

					for (const description of Array.from(descMap.keys()).sort((a, b) => a.localeCompare(b))) {
						const values = descMap.get(description)!;
						if (!description) {
							values.forEach((value, idx) => {
								noDescriptionTotals[idx] += value;
							});
							continue;
						}
						descTotals.push(values);
						descNodes.push({
							id: `${accountName}|${category}|${description}`,
							label: description,
							level: 3,
							values
						});
					}

					const categoryValues = sumArrays(
						noDescriptionTotals.some((value) => value !== 0)
							? [...descTotals, noDescriptionTotals]
							: descTotals,
						headers.length
					);
					categoryTotals.push(categoryValues);
					categoryNodes.push({
						id: `${accountName}|${category}`,
						label: category,
						level: 2,
						values: categoryValues,
						children: descNodes.length > 0 ? descNodes : undefined
					});
				}

				const accountValues = sumArrays(categoryTotals, headers.length);
				nodes.push({
					id: accountName,
					label: accountName,
					level: 1,
					values: accountValues,
					children: categoryNodes
				});
			}
			return nodes;
		};

		const incomeAccounts = buildAccountNodes(incomeMap);
		const expenseAccounts = buildAccountNodes(expenseMap);

		const incomeTotals = sumArrays(
			incomeAccounts.map((node) => node.values),
			headers.length
		);
		const expenseTotals = sumArrays(
			expenseAccounts.map((node) => node.values),
			headers.length
		);
		const netTotals = incomeTotals.map((value, idx) => value + expenseTotals[idx]);

		return [
			{
				id: 'income',
				label: 'Income',
				level: 0,
				values: incomeTotals,
				children: incomeAccounts
			},
			{
				id: 'expenses',
				label: 'Expenses',
				level: 0,
				values: expenseTotals,
				children: expenseAccounts
			},
			{
				id: 'net',
				label: 'Net',
				level: 0,
				values: netTotals
			}
		] as PnlNode[];
	})();

	const flattenPnl = (nodes: PnlNode[], expanded: Set<string>) => {
		const rows: PnlNode[] = [];
		for (const node of nodes) {
			rows.push(node);
			if (node.children && expanded.has(node.id)) {
				rows.push(...flattenPnl(node.children, expanded));
			}
		}
		return rows;
	};

	$: profitLossRows = flattenPnl(profitLossTree, expandedPnlNodes);

	const formatAxisCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0
		}).format(value);

	const getAnnualPoints = (points: { date: number; monthLabel: string; balance: number }[]) => {
		const byYear = new Map<number, { date: number; monthLabel: string; balance: number }>();
		for (const point of points) {
			const parsed = parseYearMonth(point.date);
			if (!parsed) continue;
			const existing = byYear.get(parsed.year);
			if (!existing || parsed.month > parseYearMonth(existing.date)!.month) {
				byYear.set(parsed.year, point);
			}
		}
		return Array.from(byYear.values()).sort((a, b) => a.date - b.date);
	};

	let chart: Chart | null = null;
	let chartCanvas: HTMLCanvasElement | null = null;
	const buildChartData = () => {
		const labels = chartAxisPoints.map((point) => point.monthLabel);
		const datasets = [];

		if (totalSeries) {
			datasets.push({
				label: 'Total',
				data: totalSeries.points.map((point) => point.balance),
				borderColor: '#111827',
				backgroundColor: 'rgba(17,24,39,0.08)',
				borderWidth: 2.5,
				pointRadius: 0,
				tension: 0.2
			});
		}

		for (const [index, series] of chartProjection.series.entries()) {
			datasets.push({
				label: series.name,
				data: series.points.map((point) => point.balance),
				borderColor: chartColors[index % chartColors.length],
				backgroundColor: 'transparent',
				borderWidth: 2,
				pointRadius: 0,
				tension: 0.2
			});
		}

		return { labels, datasets };
	};

	const buildChartOptions = () => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				position: 'bottom' as const,
				labels: {
					usePointStyle: true,
					boxWidth: 8,
					boxHeight: 8,
					color: '#64748b',
					font: { size: 11, weight: 600 }
				}
			},
			tooltip: {
				enabled: true,
				callbacks: {
					label: (context: any) => {
						const label = context?.dataset?.label ?? '';
						const yValue = typeof context?.parsed?.y === 'number' ? context.parsed.y : 0;
						return `${label}: ${formatAxisCurrency(yValue)}`;
					}
				}
			},
			zeroLine: {}
		},
		scales: {
			x: {
				ticks: {
					autoSkip: false,
					maxRotation: 60,
					minRotation: 60,
					color: '#94a3b8',
					font: { size: 9 }
				},
				grid: {
					color: '#e2e8f0',
					borderDash: [4, 4]
				}
			},
			y: {
				min: balanceExtent.min,
				max: balanceExtent.max,
				ticks: {
					color: '#94a3b8',
					callback: (value: number | string) =>
						formatAxisCurrency(typeof value === 'string' ? Number(value) : value)
				},
				title: {
					display: true,
					text: '$ Amount',
					color: '#64748b',
					font: { size: 10, weight: '600' }
				},
				grid: {
					color: '#e2e8f0',
					borderDash: [4, 4]
				}
			}
		}
	});

	const zeroLinePlugin = {
		id: 'zeroLine',
		afterDraw: (chartInstance: Chart) => {
			const yScale = chartInstance.scales?.y;
			if (!yScale) return;
			const zeroY = yScale.getPixelForValue(0);
			if (zeroY < yScale.top || zeroY > yScale.bottom) return;
			const ctx = chartInstance.ctx;
			ctx.save();
			ctx.strokeStyle = '#94a3b8';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(chartInstance.chartArea.left, zeroY);
			ctx.lineTo(chartInstance.chartArea.right, zeroY);
			ctx.stroke();
			ctx.restore();
		}
	};

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});

	const initChart = () => {
		if (projectionView !== 'balances') return;
		if (!chartCanvas || chart) return;
		chart = new Chart(chartCanvas, {
			type: 'line',
			data: buildChartData(),
			options: buildChartOptions(),
			plugins: [zeroLinePlugin]
		});
	};

	$: if (projectionView !== 'balances' && chart) {
		chart.destroy();
		chart = null;
	}
	$: if (projectionView === 'balances' && chartProjection.series.length === 0 && chart) {
		chart.destroy();
		chart = null;
	}

	$: if (
		chart &&
		projectionView === 'balances' &&
		projectionVersion &&
		projectionBalanceSource &&
		projectionRange
	) {
		chart.data = buildChartData();
		chart.options = buildChartOptions();
		chart.update();
	}

	afterUpdate(() => {
		initChart();
	});
</script>

<section class="not-prose -mt-8">
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
		<div class="space-y-4">
			<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="text-lg font-semibold text-slate-900">
						Projections for {data.scenario.name} ({formatYearMonthInput(projectionData.startDate)})
					</h2>
					<div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
						<div
							class={`inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 ${
								projectionView === 'balances' || projectionView === 'balance_sheet'
									? ''
									: 'pointer-events-none invisible'
							}`}
							aria-hidden={projectionView === 'balances' || projectionView === 'balance_sheet'
								? undefined
								: 'true'}
						>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionBalanceSource === 'assets'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionBalanceSource = 'assets')}
							>
								Assets
							</button>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionBalanceSource === 'accounts'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionBalanceSource = 'accounts')}
							>
								Accounts
							</button>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionBalanceSource === 'net_worth'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionBalanceSource = 'net_worth')}
							>
								Net worth
							</button>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionBalanceSource === 'liquidity'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionBalanceSource = 'liquidity')}
							>
								Liquidity
							</button>
						</div>
						<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionView === 'balances'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionView = 'balances')}
							>
								Balances chart
							</button>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionView === 'balance_sheet'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionView = 'balance_sheet')}
							>
								Balance sheet
							</button>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionView === 'profit_loss'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionView = 'profit_loss')}
							>
								P&amp;L
							</button>
							<button
								type="button"
								class={`rounded-full px-3 py-1 transition ${
									projectionView === 'transactions'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => (projectionView = 'transactions')}
							>
								Transactions
							</button>
						</div>
						<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
							<button
								type="button"
								disabled={isUpdating}
								class={`rounded-full px-3 py-1 transition ${
									projectionRange === '1y'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => updateProjectionRange('1y')}
							>
								1Y
							</button>
							<button
								type="button"
								disabled={isUpdating}
								class={`rounded-full px-3 py-1 transition ${
									projectionRange === '5y'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => updateProjectionRange('5y')}
							>
								5Y
							</button>
							<button
								type="button"
								disabled={isUpdating}
								class={`rounded-full px-3 py-1 transition ${
									projectionRange === '10y'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => updateProjectionRange('10y')}
							>
								10Y
							</button>
							<button
								type="button"
								disabled={isUpdating}
								class={`rounded-full px-3 py-1 transition ${
									projectionRange === 'all'
										? 'bg-slate-900 text-white'
										: 'text-slate-600 hover:text-slate-900'
								}`}
								on:click={() => updateProjectionRange('all')}
							>
								All
							</button>
						</div>
						<div
							class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"
						>
							<span>Auto-run</span>
							<button
								type="button"
								class={`rounded-full px-2 py-0.5 transition ${
									autoRunProjection ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
								}`}
								aria-pressed={autoRunProjection}
								on:click={() => (autoRunProjection = !autoRunProjection)}
							>
								{autoRunProjection ? 'On' : 'Off'}
							</button>
							{#if !autoRunProjection}
								<button
									type="button"
									class="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isUpdating}
									on:click={runProjectionNow}
								>
									Run now
								</button>
							{/if}
						</div>
					</div>
				</div>
				<div class="mt-4 flex flex-wrap items-center gap-6 text-sm text-slate-700">
					<div class="flex items-center gap-3">
						<span class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
							Inflation rate
						</span>
						<span class="text-sm font-semibold text-slate-900">
							{formatRate(sessionRates.inflationRate, 1)}%
						</span>
						<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
							<button
								type="button"
								class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
								disabled={isUpdating}
								on:click={() => queueInflationRateChange(-0.5)}
							>
								-
							</button>
							<button
								type="button"
								class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
								disabled={isUpdating}
								on:click={() => queueInflationRateChange(0.5)}
							>
								+
							</button>
						</div>
					</div>
				</div>
				{#if projectionError}
					<div
						class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"
					>
						{projectionError}
					</div>
				{/if}

				{#if projectionView === 'balances'}
					{#if chartProjection.series.length === 0}
						<p class="mt-3 text-sm text-slate-600">No series available for projection.</p>
					{:else}
						<div class="relative mt-4 h-72">
							<canvas bind:this={chartCanvas} class="h-full w-full"></canvas>
							{#if isUpdating}
								<div class="absolute inset-0 grid place-items-center rounded-xl bg-white/70">
									<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
										<span
											class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
										></span>
										<span>Updating projection…</span>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{:else if projectionView === 'balance_sheet'}
					{#if chartProjection.series.length === 0}
						<p class="mt-3 text-sm text-slate-600">No series available for projection.</p>
					{:else}
						<div class="relative mt-4">
							<div class="max-h-96 overflow-x-auto overflow-y-auto">
								<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
									<thead
										class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
									>
										<tr>
											<th class="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3">Line item</th>
											{#each balanceSheetHeaders as header}
												<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
											{/each}
										</tr>
									</thead>
									<tbody class="divide-y divide-slate-100 text-slate-700">
										{#each balanceSheetRows as row, rowIndex}
											<tr
												class={`whitespace-nowrap ${
													rowIndex === 0 ? 'font-semibold text-slate-900' : ''
												}`}
											>
												<td
													class={`sticky left-0 z-10 px-4 py-3 ${
														rowIndex === 0 ? 'bg-white text-slate-900' : 'bg-white'
													}`}
												>
													{row.name}
												</td>
												{#each row.values as value}
													<td
														class={`px-4 py-3 text-right ${
															value >= 0 ? 'text-emerald-600' : 'text-rose-600'
														}`}
													>
														{formatWholeCurrency(value)}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if isUpdating}
								<div class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70">
									<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
										<span
											class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
										></span>
										<span>Updating projection…</span>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{:else if projectionView === 'profit_loss'}
					{#if profitLossRows.length === 0}
						<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
					{:else}
						<div class="relative mt-4">
							<div class="max-h-96 overflow-x-auto overflow-y-auto">
								<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
									<thead
										class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
									>
										<tr>
											<th class="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3">Item</th>
											{#each balanceSheetHeaders as header}
												<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
											{/each}
										</tr>
									</thead>
									<tbody class="divide-y divide-slate-100 text-slate-700">
										{#each profitLossRows as row, rowIndex}
											<tr
												class={`whitespace-nowrap ${
													row.level === 0 ? 'font-semibold text-slate-900' : ''
												}`}
											>
												<td
													class={`sticky left-0 z-10 px-4 py-3 ${
														row.level === 0 ? 'bg-white text-slate-900' : 'bg-white'
													}`}
												>
													<div
														class="flex items-center gap-2"
														style={`padding-left: ${row.level * 14}px`}
													>
														{#if row.children?.length}
															<button
																type="button"
																class="text-slate-500 hover:text-slate-900"
																on:click={() => togglePnlNode(row.id)}
																aria-label="Toggle P&L row"
															>
																{expandedPnlNodes.has(row.id) ? '▾' : '▸'}
															</button>
														{:else}
															<span class="w-3 text-slate-400">•</span>
														{/if}
														<span>{row.label}</span>
													</div>
												</td>
												{#each row.values as value}
													<td
														class={`px-4 py-3 text-right ${
															value >= 0 ? 'text-emerald-600' : 'text-rose-600'
														}`}
													>
														{formatWholeCurrency(value)}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if isUpdating}
								<div class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70">
									<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
										<span
											class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
										></span>
										<span>Updating projection…</span>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{:else if chartProjection.transactions.length === 0}
					<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
				{:else}
					<div class="relative mt-4">
						<div class="max-h-96 overflow-x-auto overflow-y-auto">
							<table class="min-w-full divide-y divide-slate-200 text-xs">
								<thead
									class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
								>
									<tr>
										<th class="px-4 py-3">Date</th>
										<th class="px-4 py-3">Type</th>
										<th class="px-4 py-3">Asset</th>
										<th class="px-4 py-3">Category</th>
										<th class="px-4 py-3">Description</th>
										<th class="px-4 py-3">Account</th>
										<th class="px-4 py-3 text-right">Amount</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-100 text-slate-700">
									{#each chartProjection.transactions as transaction}
										<tr
											class={`whitespace-nowrap ${
												transaction.cashflowType === 'transfer'
													? 'text-amber-600'
													: transaction.amount >= 0
														? 'text-emerald-600'
														: 'text-rose-600'
											}`}
										>
											<td class="px-4 py-3">{transaction.monthLabel}</td>
											<td class="px-4 py-3">{formatLabel(transaction.cashflowType)}</td>
											<td class="px-4 py-3">{transaction.assetName ?? ''}</td>
											<td class="px-4 py-3">{formatLabel(transaction.category)}</td>
											<td class="px-4 py-3">{transaction.description ?? ''}</td>
											<td class="px-4 py-3">{transaction.accountName}</td>
											<td class="px-4 py-3 text-right font-medium">
												{formatSignedCurrency(transaction.amount)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if isUpdating}
							<div class="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70">
								<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
									<span
										class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
									></span>
									<span>Updating projection…</span>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
			<div
				id="what-if-panel"
				bind:this={whatIfPanelElement}
				class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
			>
				<div class="flex items-center gap-2">
					<h3 class="text-lg font-semibold text-slate-900">What if?...</h3>
					<span class="group relative inline-flex">
						<button
							type="button"
							class="grid h-4 w-4 place-items-center rounded-full border border-slate-900/30 bg-white text-[10px] leading-none font-bold text-slate-900"
							aria-label="What is the What if section for?"
						>
							i
						</button>
						<span
							role="tooltip"
							class="pointer-events-none absolute top-full left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
						>
							Use this area to play out your 'what if?' scenarios. What if?...
							<ul class="mt-1 list-disc pl-4">
								<li>You retire early?</li>
								<li>Interest rates go up?</li>
								<li>Etc...</li>
							</ul>
						</span>
					</span>
				</div>
				<div
					class="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold"
				>
					<button
						type="button"
						class={`rounded-full px-3 py-1 transition ${
							assetPanelTab === 'assets'
								? 'bg-slate-900 text-white'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						on:click={() => (assetPanelTab = 'assets')}
					>
						Assets
					</button>
					<button
						type="button"
						class={`rounded-full px-3 py-1 transition ${
							assetPanelTab === 'accounts'
								? 'bg-slate-900 text-white'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						on:click={() => (assetPanelTab = 'accounts')}
					>
						Accounts
					</button>
					<button
						type="button"
						class={`rounded-full px-3 py-1 transition ${
							assetPanelTab === 'transfers'
								? 'bg-slate-900 text-white'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						on:click={() => (assetPanelTab = 'transfers')}
					>
						Transfers
					</button>
					<button
						type="button"
						class={`rounded-full px-3 py-1 transition ${
							assetPanelTab === 'reserves'
								? 'bg-slate-900 text-white'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						on:click={() => (assetPanelTab = 'reserves')}
					>
						Reserves
					</button>
					<button
						type="button"
						class={`rounded-full px-3 py-1 transition ${
							assetPanelTab === 'caps'
								? 'bg-slate-900 text-white'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						on:click={() => (assetPanelTab = 'caps')}
					>
						Caps
					</button>
				</div>
				{#if assetPanelTab === 'assets'}
					<div class="mt-3 flex flex-wrap gap-2">
						<a
							href="/assets/person/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add person
						</a>
						<a
							href="/assets/property/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add property
						</a>
						{#if assetsList.some((asset) => asset.asset_type === 'property')}
							<a
								href="/assets/mortgage/create"
								class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
							>
								Add mortgage
							</a>
						{/if}
						<a
							href="/assets/superannuation/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add superannuation
						</a>
						<a
							href="/assets/shares/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add shares
						</a>
					</div>
					<div class="assets-cards mt-5 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
						{#each assetsList.filter((asset) => asset.asset_type === 'person') as person}
							<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
								<h3 class="text-sm font-semibold text-slate-900">
									{personDetails[person.id]?.name ?? person.name}
								</h3>
								<div
									class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Retirement age</span>
									<input
										type="number"
										class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={personRetirementAges[person.id] ?? ''}
										step={stepForValue(personRetirementAges[person.id] ?? 0)}
										on:input={(event) => {
											const next = Number((event.currentTarget as HTMLInputElement).value);
											const value = Number.isFinite(next) ? next : 0;
											setPersonRetirementAge(person.id, value);
											scheduleUpdate(`retirement:${person.id}`, () =>
												updateRetirementAge(person.id, value)
											);
										}}
									/>
									<button
										type="button"
										class="flex items-center justify-end text-slate-500 hover:text-slate-700"
										aria-label={expandedPersonDetailIds.has(person.id)
											? 'Hide details'
											: 'Show details'}
										title={expandedPersonDetailIds.has(person.id) ? 'Hide details' : 'Show details'}
										on:click={() => togglePersonDetails(person.id)}
									>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="h-4 w-4"
										>
											<path d="M5 12h14" />
											{#if !expandedPersonDetailIds.has(person.id)}
												<path d="M12 5v14" />
											{/if}
										</svg>
									</button>
								</div>
								{#if expandedPersonDetailIds.has(person.id)}
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Start date (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={personDetails[person.id]?.startDate ?? ''}
												on:input={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													setPersonDetails(person.id, { ...current, startDate: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'startDate', '');
													}
												}}
												on:change={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													if (next.trim().length === 0 || !isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (!current.name.trim()) {
														setPersonDetailsError(person.id, 'name', 'Name is required.');
														return;
													}
													if (current.dob.trim().length === 0 || !isValidMonthYear(current.dob)) {
														setPersonDetailsError(person.id, 'dob', 'Use MM YYYY format.');
														return;
													}
													setPersonDetailsError(person.id, 'startDate', '');
													setPersonDetails(person.id, { ...current, startDate: next });
													scheduleUpdate(`person-details:${person.id}`, () =>
														updatePersonDetails(person.id, current.name, next, current.dob)
													);
												}}
											/>
											{#if personDetailsErrors[person.id]?.startDate}
												<span class="mt-1 text-[10px] text-rose-600">
													{personDetailsErrors[person.id]?.startDate}
												</span>
											{/if}
										</div>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Name</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={personDetails[person.id]?.name ?? person.name}
												on:input={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													setPersonDetails(person.id, { ...current, name: next });
													if (next.trim().length > 0) {
														setPersonDetailsError(person.id, 'name', '');
													}
												}}
												on:change={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value.trim();
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													if (!next) {
														setPersonDetailsError(person.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.startDate.trim().length === 0 ||
														!isValidMonthYear(current.startDate)
													) {
														setPersonDetailsError(person.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (current.dob.trim().length === 0 || !isValidMonthYear(current.dob)) {
														setPersonDetailsError(person.id, 'dob', 'Use MM YYYY format.');
														return;
													}
													setPersonDetailsError(person.id, 'name', '');
													setPersonDetails(person.id, { ...current, name: next });
													assetsList = assetsList.map((asset) =>
														asset.id === person.id ? { ...asset, name: next } : asset
													);
													scheduleUpdate(`person-details:${person.id}`, () =>
														updatePersonDetails(person.id, next, current.startDate, current.dob)
													);
												}}
											/>
											{#if personDetailsErrors[person.id]?.name}
												<span class="mt-1 text-[10px] text-rose-600">
													{personDetailsErrors[person.id]?.name}
												</span>
											{/if}
										</div>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Date of birth (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={personDetails[person.id]?.dob ?? ''}
												on:input={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													setPersonDetails(person.id, { ...current, dob: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'dob', '');
													}
												}}
												on:change={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													if (next.trim().length === 0 || !isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'dob', 'Use MM YYYY format.');
														return;
													}
													if (!current.name.trim()) {
														setPersonDetailsError(person.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.startDate.trim().length === 0 ||
														!isValidMonthYear(current.startDate)
													) {
														setPersonDetailsError(person.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													setPersonDetailsError(person.id, 'dob', '');
													setPersonDetails(person.id, { ...current, dob: next });
													scheduleUpdate(`person-details:${person.id}`, () =>
														updatePersonDetails(person.id, current.name, current.startDate, next)
													);
												}}
											/>
											{#if personDetailsErrors[person.id]?.dob}
												<span class="mt-1 text-[10px] text-rose-600">
													{personDetailsErrors[person.id]?.dob}
												</span>
											{/if}
										</div>
										<span></span>
									</div>
								{/if}
								<div class="mt-3 space-y-2">
									{#each cashflowsByAssetId[person.id] ?? [] as cashflow}
										<div
											class={`grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs ${
												cashflow.cashflow_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
											}`}
										>
											<span class="truncate">
												{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
											</span>
											<input
												id={`cashflow-input-${cashflow.id}`}
												type="number"
												class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={cashflowAmounts[cashflow.id] ?? cashflow.amount}
												step={Math.max(
													stepForValue(cashflowAmounts[cashflow.id] ?? cashflow.amount),
													0.25
												)}
												on:focus={() => {
													editingCashflowIds = new Set([...editingCashflowIds, cashflow.id]);
												}}
												on:blur={() => {
													const next = new Set(editingCashflowIds);
													next.delete(cashflow.id);
													editingCashflowIds = next;
												}}
												on:input={(event) => {
													const next = Number((event.currentTarget as HTMLInputElement).value);
													const value = Number.isFinite(next) ? next : 0;
													setCashflowAmount(cashflow.id, value);
													scheduleUpdate(`cashflow:${cashflow.id}`, () =>
														updateCashflowAmount(cashflow.id, value)
													);
												}}
											/>
											<div class="flex items-center justify-end gap-1">
												<button
													type="button"
													class="text-amber-500 hover:text-amber-600"
													aria-label="Edit cashflow"
													title="Edit cashflow"
													on:click={() => openCashflowFormForEdit(person.id, cashflow)}
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														class="h-4 w-4"
													>
														<path d="M12 20h9" />
														<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
													</svg>
												</button>
												<button
													type="button"
													class="text-rose-500 hover:text-rose-600"
													aria-label="Delete cashflow"
													title="Delete cashflow"
													on:click={() => requestDeleteCashflow(cashflow.id)}
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														class="h-4 w-4"
													>
														<path d="M3 6h18" />
														<path d="M8 6V4h8v2" />
														<path d="M6 6l1 14h10l1-14" />
														<path d="M10 11v6" />
														<path d="M14 11v6" />
													</svg>
												</button>
											</div>
										</div>
									{/each}
								</div>
								<div class="mt-3 flex justify-end gap-2 text-xs font-semibold">
									<button
										type="button"
										class="rounded-full border border-slate-200 bg-white px-3 py-1 text-emerald-700"
										on:click={() => openCashflowForm(person.id, 'income')}
									>
										Add income
									</button>
									<button
										type="button"
										class="rounded-full border border-slate-200 bg-white px-3 py-1 text-rose-700"
										on:click={() => openCashflowForm(person.id, 'expense')}
									>
										Add expense
									</button>
								</div>
								{#if activeCashflowForm && activeCashflowForm.assetId === person.id}
									{@const draftKey = getDraftKey(
										person.id,
										activeCashflowForm.type,
										activeCashflowForm.cashflowId
									)}
									{@const draft = cashflowDrafts[draftKey]}
									{#if draft}
										<div class="mt-3 rounded-lg border border-slate-200 bg-white p-3">
											<div class="text-xs font-semibold text-slate-700">
												{activeCashflowForm.cashflowId ? 'Edit' : 'New'}{' '}
												{draft.type === 'income' ? 'Income' : 'Expense'}
											</div>
											{#each [getCategoryOptionsFor(person.id, draft.type)] as options}
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">Category</span>
													<select
														class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={draft.category}
														disabled={options.length === 1}
														on:change={(event) =>
															setCashflowDraft(draftKey, {
																category: (event.currentTarget as HTMLSelectElement)
																	.value as typeof draft.category
															})}
													>
														{#each options as option}
															<option value={option.value}>{option.label}</option>
														{/each}
													</select>
												</div>
											{/each}
											<div
												class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Description</span>
												<input
													type="text"
													class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={draft.description}
													on:input={(event) =>
														setCashflowDraft(draftKey, {
															description: (event.currentTarget as HTMLInputElement).value
														})}
												/>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Amount</span>
												<input
													type="number"
													class="ml-auto w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={draft.amount}
													step={stepForValue(Number(draft.amount) || 0)}
													on:input={(event) =>
														setCashflowDraft(draftKey, {
															amount: (event.currentTarget as HTMLInputElement).value
														})}
												/>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Start (MM YYYY)</span>
												<input
													type="text"
													inputmode="numeric"
													pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
													class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={toMonthYearInput(draft.startDate)}
													on:input={(event) =>
														setCashflowDraft(draftKey, {
															startDate: (event.currentTarget as HTMLInputElement).value
														})}
												/>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">End (MM YYYY)</span>
												<input
													type="text"
													inputmode="numeric"
													pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
													class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={toMonthYearInput(draft.endDate)}
													on:input={(event) =>
														setCashflowDraft(draftKey, {
															endDate: (event.currentTarget as HTMLInputElement).value
														})}
												/>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Frequency</span>
												<select
													class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={draft.frequency}
													on:change={(event) =>
														setCashflowDraft(draftKey, {
															frequency: (event.currentTarget as HTMLSelectElement)
																.value as typeof draft.frequency
														})}
												>
													{#each cashflowFrequencyOptions as option}
														<option value={option.value}>{option.label}</option>
													{/each}
												</select>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Account</span>
												<select
													class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={draft.assetAccountId}
													on:change={(event) =>
														setCashflowDraft(draftKey, {
															assetAccountId: (event.currentTarget as HTMLSelectElement).value
														})}
												>
													{#each getAssetAccountOptions(person.id) as option}
														<option value={option.id}>{option.name}</option>
													{/each}
												</select>
											</div>
											<label class="mt-2 flex items-center gap-2 text-xs text-slate-600">
												<input
													type="checkbox"
													checked={draft.inflationAffected}
													on:change={(event) =>
														setCashflowDraft(draftKey, {
															inflationAffected: (event.currentTarget as HTMLInputElement).checked
														})}
													class="h-4 w-4 accent-slate-600"
												/>
												<span class="text-slate-500">Inflation affected</span>
											</label>
											{#if cashflowFormErrors[person.id]}
												<div class="mt-2 text-xs text-rose-600">
													{cashflowFormErrors[person.id]}
												</div>
											{/if}
											<div class="mt-3 flex items-center gap-2">
												<button
													type="button"
													class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
													on:click={closeCashflowForm}
												>
													Cancel
												</button>
												<button
													type="button"
													class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
													disabled={!draft.assetAccountId}
													on:click={() =>
														activeCashflowForm?.cashflowId
															? updateAssetCashflow(person.id, activeCashflowForm.cashflowId, draft)
															: createAssetCashflow(person.id, draft)}
												>
													{activeCashflowForm.cashflowId ? 'Save' : 'Add'}
												</button>
											</div>
										</div>
									{/if}
								{/if}
							</div>
						{/each}
						{#each assetsList.filter((asset) => asset.asset_type === 'shares') as share}
							<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
								<h3 class="truncate text-sm font-semibold text-slate-900">
									{shareDetails[share.id]?.name ?? share.name}
								</h3>
								<div
									class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Capital growth rate</span>
									<div class="flex flex-col items-end justify-self-end">
										<input
											type="number"
											class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={formatRate(shareDetails[share.id]?.capitalGrowthRate ?? 0, 2)}
											step="0.01"
											on:input={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												setShareDetails(share.id, {
													...current,
													capitalGrowthRate: Number.isFinite(next) ? next : 0
												});
											}}
											on:change={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												if (!Number.isFinite(next)) {
													setShareError(share.id, 'capitalGrowthRate', 'Use a valid number.');
													return;
												}
												setShareError(share.id, 'capitalGrowthRate', '');
												setShareDetails(share.id, {
													...current,
													capitalGrowthRate: roundToTwo(next)
												});
												scheduleUpdate(`shares:${share.id}`, () =>
													updateShareDetails(
														share.id,
														current.name,
														current.startDate,
														roundToTwo(next),
														current.dividendYield,
														current.dividendsTakenAsIncomeDate
													)
												);
											}}
										/>
										{#if shareErrors[share.id]?.capitalGrowthRate}
											<span class="mt-1 text-[10px] text-rose-600">
												{shareErrors[share.id]?.capitalGrowthRate}
											</span>
										{/if}
									</div>
									<span></span>
								</div>
								<div
									class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Dividend yield</span>
									<div class="flex flex-col items-end justify-self-end">
										<input
											type="number"
											class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={formatRate(shareDetails[share.id]?.dividendYield ?? 0, 2)}
											step="0.01"
											on:input={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												setShareDetails(share.id, {
													...current,
													dividendYield: Number.isFinite(next) ? next : 0
												});
											}}
											on:change={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												if (!Number.isFinite(next)) {
													setShareError(share.id, 'dividendYield', 'Use a valid number.');
													return;
												}
												setShareError(share.id, 'dividendYield', '');
												setShareDetails(share.id, { ...current, dividendYield: roundToTwo(next) });
												scheduleUpdate(`shares:${share.id}`, () =>
													updateShareDetails(
														share.id,
														current.name,
														current.startDate,
														current.capitalGrowthRate,
														roundToTwo(next),
														current.dividendsTakenAsIncomeDate
													)
												);
											}}
										/>
										{#if shareErrors[share.id]?.dividendYield}
											<span class="mt-1 text-[10px] text-rose-600">
												{shareErrors[share.id]?.dividendYield}
											</span>
										{/if}
									</div>
									<span></span>
								</div>
								<div
									class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Dividends taken as income</span>
									<div class="flex flex-col items-end justify-self-end">
										<input
											type="text"
											inputmode="numeric"
											pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
											class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={shareDetails[share.id]?.dividendsTakenAsIncomeDate ?? ''}
											on:input={(event) => {
												const next = (event.currentTarget as HTMLInputElement).value;
												const current = shareDetails[share.id];
												if (!current) return;
												setShareDetails(share.id, { ...current, dividendsTakenAsIncomeDate: next });
												if (next.trim().length === 0 || isValidMonthYear(next)) {
													setShareError(share.id, 'dividendsTakenAsIncomeDate', '');
												}
											}}
											on:change={(event) => {
												const next = (event.currentTarget as HTMLInputElement).value;
												const current = shareDetails[share.id];
												if (!current) return;
												if (next.trim().length === 0 || !isValidMonthYear(next)) {
													setShareError(
														share.id,
														'dividendsTakenAsIncomeDate',
														'Use MM YYYY format.'
													);
													return;
												}
												setShareError(share.id, 'dividendsTakenAsIncomeDate', '');
												setShareDetails(share.id, { ...current, dividendsTakenAsIncomeDate: next });
												scheduleUpdate(`shares:${share.id}`, () =>
													updateShareDetails(
														share.id,
														current.name,
														current.startDate,
														current.capitalGrowthRate,
														current.dividendYield,
														next
													)
												);
											}}
										/>
										{#if shareErrors[share.id]?.dividendsTakenAsIncomeDate}
											<span class="mt-1 text-[10px] text-rose-600">
												{shareErrors[share.id]?.dividendsTakenAsIncomeDate}
											</span>
										{/if}
									</div>
									<button
										type="button"
										class="flex items-center justify-end text-slate-500 hover:text-slate-700"
										aria-label={expandedShareDetailIds.has(share.id)
											? 'Hide details'
											: 'Show details'}
										title={expandedShareDetailIds.has(share.id) ? 'Hide details' : 'Show details'}
										on:click={() => toggleShareDetails(share.id)}
									>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="h-4 w-4"
										>
											<path d="M5 12h14" />
											{#if !expandedShareDetailIds.has(share.id)}
												<path d="M12 5v14" />
											{/if}
										</svg>
									</button>
								</div>
								{#if expandedShareDetailIds.has(share.id)}
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Start date (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={shareDetails[share.id]?.startDate ?? ''}
												on:input={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = shareDetails[share.id];
													if (!current) return;
													setShareDetails(share.id, { ...current, startDate: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setShareError(share.id, 'startDate', '');
													}
												}}
												on:change={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = shareDetails[share.id];
													if (!current) return;
													if (next.trim().length === 0 || !isValidMonthYear(next)) {
														setShareError(share.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (!current.name.trim()) {
														setShareError(share.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.dividendsTakenAsIncomeDate.trim().length === 0 ||
														!isValidMonthYear(current.dividendsTakenAsIncomeDate)
													) {
														setShareError(
															share.id,
															'dividendsTakenAsIncomeDate',
															'Use MM YYYY format.'
														);
														return;
													}
													setShareError(share.id, 'startDate', '');
													setShareDetails(share.id, { ...current, startDate: next });
													scheduleUpdate(`shares:${share.id}`, () =>
														updateShareDetails(
															share.id,
															current.name,
															next,
															current.capitalGrowthRate,
															current.dividendYield,
															current.dividendsTakenAsIncomeDate
														)
													);
												}}
											/>
											{#if shareErrors[share.id]?.startDate}
												<span class="mt-1 text-[10px] text-rose-600"
													>{shareErrors[share.id]?.startDate}</span
												>
											{/if}
										</div>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Name</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={shareDetails[share.id]?.name ?? share.name}
												on:input={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = shareDetails[share.id];
													if (!current) return;
													setShareDetails(share.id, { ...current, name: next });
													if (next.trim().length > 0) {
														setShareError(share.id, 'name', '');
													}
												}}
												on:change={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value.trim();
													const current = shareDetails[share.id];
													if (!current) return;
													if (!next) {
														setShareError(share.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.startDate.trim().length === 0 ||
														!isValidMonthYear(current.startDate)
													) {
														setShareError(share.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (
														current.dividendsTakenAsIncomeDate.trim().length === 0 ||
														!isValidMonthYear(current.dividendsTakenAsIncomeDate)
													) {
														setShareError(
															share.id,
															'dividendsTakenAsIncomeDate',
															'Use MM YYYY format.'
														);
														return;
													}
													setShareError(share.id, 'name', '');
													setShareDetails(share.id, { ...current, name: next });
													assetsList = assetsList.map((asset) =>
														asset.id === share.id ? { ...asset, name: next } : asset
													);
													scheduleUpdate(`shares:${share.id}`, () =>
														updateShareDetails(
															share.id,
															next,
															current.startDate,
															current.capitalGrowthRate,
															current.dividendYield,
															current.dividendsTakenAsIncomeDate
														)
													);
												}}
											/>
											{#if shareErrors[share.id]?.name}
												<span class="mt-1 text-[10px] text-rose-600"
													>{shareErrors[share.id]?.name}</span
												>
											{/if}
										</div>
										<span></span>
									</div>
								{/if}
							</div>
						{/each}
						{#each assetsList.filter((asset) => asset.asset_type === 'property') as property}
							<div class="flex w-full flex-col gap-3">
								<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
									<h3 class="text-sm font-semibold text-slate-900">
										{propertyDetails[property.id]?.name ?? property.name}
									</h3>
									<div
										class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Market growth rate</span>
										<input
											type="number"
											class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={formatRate(propertyDetails[property.id]?.marketGrowthRate ?? 0, 1)}
											step="0.5"
											on:input={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = propertyDetails[property.id] ?? {
													name: property.name,
													startDate: formatYearMonthInput(property.start_date),
													marketValue: Number(property.details?.marketValue) || 0,
													marketGrowthRate: 0,
													saleDate: '',
													fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
													variableSellingCosts: Number(property.details?.variableSellingCosts) || 0
												};
												setPropertyDetails(property.id, {
													...current,
													marketGrowthRate: Number.isFinite(next) ? next : 0
												});
											}}
											on:change={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = propertyDetails[property.id] ?? {
													name: property.name,
													startDate: formatYearMonthInput(property.start_date),
													marketValue: Number(property.details?.marketValue) || 0,
													marketGrowthRate: 0,
													saleDate: '',
													fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
													variableSellingCosts: Number(property.details?.variableSellingCosts) || 0
												};
												const value = Number.isFinite(next) ? next : 0;
												setPropertyDetails(property.id, { ...current, marketGrowthRate: value });
												scheduleUpdate(`property:${property.id}`, () =>
													updatePropertyDetails(
														property.id,
														current.name,
														current.startDate,
														current.marketValue ?? 0,
														value,
														current.saleDate ?? '',
														current.fixedSellingCosts ?? 0,
														current.variableSellingCosts ?? 0
													)
												);
											}}
										/>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Sale date (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={propertyDetails[property.id]?.saleDate ?? ''}
												on:input={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = propertyDetails[property.id] ?? {
														name: property.name,
														startDate: formatYearMonthInput(property.start_date),
														marketValue: Number(property.details?.marketValue) || 0,
														marketGrowthRate: 0,
														saleDate: '',
														fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
														variableSellingCosts:
															Number(property.details?.variableSellingCosts) || 0
													};
													setPropertyDetails(property.id, { ...current, saleDate: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setPropertyError(property.id, 'saleDate', '');
													}
												}}
												on:change={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = propertyDetails[property.id] ?? {
														name: property.name,
														startDate: formatYearMonthInput(property.start_date),
														marketValue: Number(property.details?.marketValue) || 0,
														marketGrowthRate: 0,
														saleDate: '',
														fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
														variableSellingCosts:
															Number(property.details?.variableSellingCosts) || 0
													};
													if (next.trim().length > 0 && !isValidMonthYear(next)) {
														setPropertyError(property.id, 'saleDate', 'Use MM YYYY format.');
														return;
													}
													setPropertyError(property.id, 'saleDate', '');
													setPropertyDetails(property.id, { ...current, saleDate: next });
													scheduleUpdate(`property:${property.id}`, () =>
														updatePropertyDetails(
															property.id,
															current.name,
															current.startDate,
															current.marketValue ?? 0,
															current.marketGrowthRate ?? 0,
															next,
															current.fixedSellingCosts ?? 0,
															current.variableSellingCosts ?? 0
														)
													);
												}}
											/>
											{#if propertyErrors[property.id]?.saleDate}
												<span class="mt-1 text-[10px] text-rose-600">
													{propertyErrors[property.id]?.saleDate}
												</span>
											{/if}
										</div>
										<button
											type="button"
											class="flex items-center justify-end text-slate-500 hover:text-slate-700"
											aria-label={expandedPropertyDetailIds.has(property.id)
												? 'Hide details'
												: 'Show details'}
											title={expandedPropertyDetailIds.has(property.id)
												? 'Hide details'
												: 'Show details'}
											on:click={() => togglePropertyDetails(property.id)}
										>
											<svg
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												class="h-4 w-4"
											>
												<path d="M5 12h14" />
												{#if !expandedPropertyDetailIds.has(property.id)}
													<path d="M12 5v14" />
												{/if}
											</svg>
										</button>
									</div>
									{#if expandedPropertyDetailIds.has(property.id)}
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Start date (MM YYYY)</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="text"
													inputmode="numeric"
													pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.startDate ?? ''}
													on:input={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value;
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, { ...current, startDate: next });
														if (next.trim().length > 0 && isValidMonthYear(next)) {
															setPropertyError(property.id, 'startDate', '');
														}
													}}
													on:change={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value;
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!isValidMonthYear(next)) {
															setPropertyError(property.id, 'startDate', 'Use MM YYYY format.');
															return;
														}
														setPropertyError(property.id, 'startDate', '');
														setPropertyDetails(property.id, { ...current, startDate: next });
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																next,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.startDate}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.startDate}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Name</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="text"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.name ?? property.name}
													on:input={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value;
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, { ...current, name: next });
														if (next.trim().length > 0) {
															setPropertyError(property.id, 'name', '');
														}
													}}
													on:change={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value.trim();
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!next) {
															setPropertyError(property.id, 'name', 'Name is required.');
															return;
														}
														setPropertyError(property.id, 'name', '');
														setPropertyDetails(property.id, { ...current, name: next });
														assetsList = assetsList.map((asset) =>
															asset.id === property.id ? { ...asset, name: next } : asset
														);
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																next,
																current.startDate,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.name}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.name}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Market value</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="number"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.marketValue ?? 0}
													step={stepForValue(propertyDetails[property.id]?.marketValue ?? 0)}
													on:input={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, {
															...current,
															marketValue: Number.isFinite(next) ? next : 0
														});
													}}
													on:change={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!Number.isFinite(next)) {
															setPropertyError(property.id, 'marketValue', 'Use a valid number.');
															return;
														}
														setPropertyError(property.id, 'marketValue', '');
														setPropertyDetails(property.id, { ...current, marketValue: next });
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																current.startDate,
																next,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.marketValue}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.marketValue}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Fixed selling costs</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="number"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.fixedSellingCosts ?? 0}
													step={stepForValue(propertyDetails[property.id]?.fixedSellingCosts ?? 0)}
													on:input={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, {
															...current,
															fixedSellingCosts: Number.isFinite(next) ? next : 0
														});
													}}
													on:change={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!Number.isFinite(next)) {
															setPropertyError(
																property.id,
																'fixedSellingCosts',
																'Use a valid number.'
															);
															return;
														}
														setPropertyError(property.id, 'fixedSellingCosts', '');
														setPropertyDetails(property.id, {
															...current,
															fixedSellingCosts: next
														});
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																current.startDate,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																next,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.fixedSellingCosts}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.fixedSellingCosts}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Variable selling costs (%)</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="number"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.variableSellingCosts ?? 0}
													step="0.01"
													on:input={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, {
															...current,
															variableSellingCosts: Number.isFinite(next) ? next : 0
														});
													}}
													on:change={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!Number.isFinite(next)) {
															setPropertyError(
																property.id,
																'variableSellingCosts',
																'Use a valid number.'
															);
															return;
														}
														setPropertyError(property.id, 'variableSellingCosts', '');
														setPropertyDetails(property.id, {
															...current,
															variableSellingCosts: next
														});
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																current.startDate,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																next
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.variableSellingCosts}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.variableSellingCosts}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
									{/if}
									<div class="mt-3 space-y-2">
										{#each cashflowsByAssetId[property.id] ?? [] as cashflow}
											<div
												class={`grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs ${
													cashflow.cashflow_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
												}`}
											>
												<span class="truncate">
													{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
												</span>
												<input
													type="number"
													class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={cashflowAmounts[cashflow.id] ?? cashflow.amount}
													step={Math.max(
														stepForValue(cashflowAmounts[cashflow.id] ?? cashflow.amount),
														0.25
													)}
													on:focus={() => {
														editingCashflowIds = new Set([...editingCashflowIds, cashflow.id]);
													}}
													on:blur={() => {
														const next = new Set(editingCashflowIds);
														next.delete(cashflow.id);
														editingCashflowIds = next;
													}}
													on:input={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const value = Number.isFinite(next) ? next : 0;
														setCashflowAmount(cashflow.id, value);
													}}
													on:change={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const value = Number.isFinite(next) ? next : 0;
														setCashflowAmount(cashflow.id, value);
														scheduleUpdate(`cashflow:${cashflow.id}`, () =>
															updateCashflowAmount(cashflow.id, value)
														);
													}}
												/>
												<div class="flex items-center justify-end gap-1">
													<button
														type="button"
														class="text-amber-500 hover:text-amber-600"
														aria-label="Edit cashflow"
														title="Edit cashflow"
														on:click={() => openCashflowFormForEdit(property.id, cashflow)}
													>
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															stroke-linecap="round"
															stroke-linejoin="round"
															class="h-4 w-4"
														>
															<path d="M12 20h9" />
															<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
														</svg>
													</button>
													<button
														type="button"
														class="text-rose-500 hover:text-rose-600"
														aria-label="Delete cashflow"
														title="Delete cashflow"
														on:click={() => requestDeleteCashflow(cashflow.id)}
													>
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															stroke-linecap="round"
															stroke-linejoin="round"
															class="h-4 w-4"
														>
															<path d="M3 6h18" />
															<path d="M8 6V4h8v2" />
															<path d="M6 6l1 14h10l1-14" />
															<path d="M10 11v6" />
															<path d="M14 11v6" />
														</svg>
													</button>
												</div>
											</div>
										{/each}
									</div>
									<div class="mt-3 flex justify-end gap-2 text-xs font-semibold">
										<button
											type="button"
											class="rounded-full border border-slate-200 bg-white px-3 py-1 text-emerald-700"
											on:click={() => openCashflowForm(property.id, 'income')}
										>
											Add income
										</button>
										<button
											type="button"
											class="rounded-full border border-slate-200 bg-white px-3 py-1 text-rose-700"
											on:click={() => openCashflowForm(property.id, 'expense')}
										>
											Add expense
										</button>
									</div>
									{#if activeCashflowForm && activeCashflowForm.assetId === property.id}
										{@const draftKey = getDraftKey(
											property.id,
											activeCashflowForm.type,
											activeCashflowForm.cashflowId
										)}
										{@const draft = cashflowDrafts[draftKey]}
										{#if draft}
											<div class="mt-3 rounded-lg border border-slate-200 bg-white p-3">
												<div class="text-xs font-semibold text-slate-700">
													{activeCashflowForm.cashflowId ? 'Edit' : 'New'}{' '}
													{draft.type === 'income' ? 'Income' : 'Expense'}
												</div>
												{#each [getCategoryOptionsFor(property.id, draft.type)] as options}
													<div
														class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
													>
														<span class="truncate text-slate-500">Category</span>
														<select
															class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
															value={draft.category}
															disabled={options.length === 1}
															on:change={(event) =>
																setCashflowDraft(draftKey, {
																	category: (event.currentTarget as HTMLSelectElement)
																		.value as typeof draft.category
																})}
														>
															{#each options as option}
																<option value={option.value}>{option.label}</option>
															{/each}
														</select>
													</div>
												{/each}
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">Description</span>
													<input
														type="text"
														class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={draft.description}
														on:input={(event) =>
															setCashflowDraft(draftKey, {
																description: (event.currentTarget as HTMLInputElement).value
															})}
													/>
												</div>
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">Amount</span>
													<input
														type="number"
														class="ml-auto w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={draft.amount}
														step={stepForValue(Number(draft.amount) || 0)}
														on:input={(event) =>
															setCashflowDraft(draftKey, {
																amount: (event.currentTarget as HTMLInputElement).value
															})}
													/>
												</div>
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">Start (MM YYYY)</span>
													<input
														type="text"
														inputmode="numeric"
														pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
														class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={toMonthYearInput(draft.startDate)}
														on:input={(event) =>
															setCashflowDraft(draftKey, {
																startDate: (event.currentTarget as HTMLInputElement).value
															})}
													/>
												</div>
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">End (MM YYYY)</span>
													<input
														type="text"
														inputmode="numeric"
														pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
														class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={toMonthYearInput(draft.endDate)}
														on:input={(event) =>
															setCashflowDraft(draftKey, {
																endDate: (event.currentTarget as HTMLInputElement).value
															})}
													/>
												</div>
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">Frequency</span>
													<select
														class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={draft.frequency}
														on:change={(event) =>
															setCashflowDraft(draftKey, {
																frequency: (event.currentTarget as HTMLSelectElement)
																	.value as typeof draft.frequency
															})}
													>
														{#each cashflowFrequencyOptions as option}
															<option value={option.value}>{option.label}</option>
														{/each}
													</select>
												</div>
												<div
													class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600"
												>
													<span class="truncate text-slate-500">Account</span>
													<select
														class="ml-auto w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={draft.assetAccountId}
														on:change={(event) =>
															setCashflowDraft(draftKey, {
																assetAccountId: (event.currentTarget as HTMLSelectElement).value
															})}
													>
														{#each getAssetAccountOptions(property.id) as option}
															<option value={option.id}>{option.name}</option>
														{/each}
													</select>
												</div>
												<label class="mt-2 flex items-center gap-2 text-xs text-slate-600">
													<input
														type="checkbox"
														checked={draft.inflationAffected}
														on:change={(event) =>
															setCashflowDraft(draftKey, {
																inflationAffected: (event.currentTarget as HTMLInputElement).checked
															})}
														class="h-4 w-4 accent-slate-600"
													/>
													<span class="text-slate-500">Inflation affected</span>
												</label>
												{#if cashflowFormErrors[property.id]}
													<div class="mt-2 text-xs text-rose-600">
														{cashflowFormErrors[property.id]}
													</div>
												{/if}
												<div class="mt-3 flex items-center gap-2">
													<button
														type="button"
														class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
														on:click={closeCashflowForm}
													>
														Cancel
													</button>
													<button
														type="button"
														class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
														disabled={!draft.assetAccountId}
														on:click={() =>
															activeCashflowForm?.cashflowId
																? updateAssetCashflow(
																		property.id,
																		activeCashflowForm.cashflowId,
																		draft
																	)
																: createAssetCashflow(property.id, draft)}
													>
														{activeCashflowForm.cashflowId ? 'Save' : 'Add'}
													</button>
												</div>
											</div>
										{/if}
									{/if}
								</div>
								{#each assetsList.filter((asset) => asset.asset_type === 'mortgage' && asset.property_id === property.id) as mortgage}
									{@const mortgageAccountLink = assetAccountsList.find(
										(link) => link.asset_id === mortgage.id && link.relationship_role === 'held_in'
									)}
									<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
										<div class="flex items-center justify-between gap-2">
											<h3 class="truncate text-sm font-semibold text-slate-900">
												{mortgageDetails[mortgage.id]?.name ?? mortgage.name}
											</h3>
											<button
												type="button"
												class="flex items-center justify-end text-slate-500 hover:text-slate-700"
												aria-label={expandedMortgageDetailIds.has(mortgage.id)
													? 'Hide details'
													: 'Show details'}
												title={expandedMortgageDetailIds.has(mortgage.id)
													? 'Hide details'
													: 'Show details'}
												on:click={() => toggleMortgageDetails(mortgage.id)}
											>
												<svg
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													class="h-4 w-4"
												>
													<path d="M5 12h14" />
													{#if !expandedMortgageDetailIds.has(mortgage.id)}
														<path d="M12 5v14" />
													{/if}
												</svg>
											</button>
										</div>
										{#if expandedMortgageDetailIds.has(mortgage.id)}
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Start date (MM YYYY)</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="text"
														inputmode="numeric"
														pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.startDate ?? ''}
														on:input={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, { ...current, startDate: next });
															if (next.trim().length === 0 || isValidMonthYear(next)) {
																setMortgageError(mortgage.id, 'startDate', '');
															}
														}}
														on:change={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															const updated = { ...current, startDate: next };
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
																	updated.name,
																	updated.startDate,
																	updated.termYears,
																	updated.termMonths,
																	updated.mortgageAccountName,
																	updated.openingBalance
																)
															);
														}}
													/>
													{#if mortgageErrors[mortgage.id]?.startDate}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.startDate}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Mortgage name</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="text"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.name ?? mortgage.name}
														on:input={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, { ...current, name: next });
															if (next.trim().length > 0) {
																setMortgageError(mortgage.id, 'name', '');
															}
														}}
														on:change={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value.trim();
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															const updated = { ...current, name: next };
															setMortgageDetails(mortgage.id, updated);
															assetsList = assetsList.map((asset) =>
																asset.id === mortgage.id ? { ...asset, name: next } : asset
															);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
																	updated.name,
																	updated.startDate,
																	updated.termYears,
																	updated.termMonths,
																	updated.mortgageAccountName,
																	updated.openingBalance
																)
															);
														}}
													/>
													{#if mortgageErrors[mortgage.id]?.name}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.name}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Term remaining (years)</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="number"
														min="0"
														step="1"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.termYears ?? 0}
														on:input={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																termYears: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0
															});
														}}
														on:change={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current || !Number.isFinite(next)) {
																setMortgageError(mortgage.id, 'termYears', 'Use 0 or more years.');
																return;
															}
															const updated = {
																...current,
																termYears: Math.max(0, Math.round(next))
															};
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
																	updated.name,
																	updated.startDate,
																	updated.termYears,
																	updated.termMonths,
																	updated.mortgageAccountName,
																	updated.openingBalance
																)
															);
														}}
													/>
													{#if mortgageErrors[mortgage.id]?.termYears}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.termYears}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Term remaining (months)</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="number"
														min="0"
														max="11"
														step="1"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.termMonths ?? 0}
														on:input={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																termMonths: Number.isFinite(next)
																	? Math.min(11, Math.max(0, Math.round(next)))
																	: 0
															});
														}}
														on:change={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current || !Number.isFinite(next) || next < 0 || next > 11) {
																setMortgageError(
																	mortgage.id,
																	'termMonths',
																	'Use a value from 0 to 11.'
																);
																return;
															}
															const updated = {
																...current,
																termMonths: Math.round(next)
															};
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
																	updated.name,
																	updated.startDate,
																	updated.termYears,
																	updated.termMonths,
																	updated.mortgageAccountName,
																	updated.openingBalance
																)
															);
														}}
													/>
													{#if mortgageErrors[mortgage.id]?.termMonths}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.termMonths}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Mortgage account name</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="text"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.mortgageAccountName ?? ''}
														on:input={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																mortgageAccountName: next
															});
															if (next.trim().length > 0) {
																setMortgageError(mortgage.id, 'mortgageAccountName', '');
															}
														}}
														on:change={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value.trim();
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															const updated = { ...current, mortgageAccountName: next };
															setMortgageDetails(mortgage.id, updated);
															if (mortgageAccountLink?.account_id) {
																accountsList = accountsList.map((account) =>
																	account.id === mortgageAccountLink.account_id
																		? { ...account, name: next }
																		: account
																);
															}
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
																	updated.name,
																	updated.startDate,
																	updated.termYears,
																	updated.termMonths,
																	updated.mortgageAccountName,
																	updated.openingBalance
																)
															);
														}}
													/>
													{#if mortgageErrors[mortgage.id]?.mortgageAccountName}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.mortgageAccountName}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Opening balance</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="number"
														step="0.01"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.openingBalance ?? 0}
														on:input={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																openingBalance: Number.isFinite(next) ? next : 0
															});
														}}
														on:change={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current || !Number.isFinite(next)) {
																setMortgageError(
																	mortgage.id,
																	'openingBalance',
																	'Use a valid number.'
																);
																return;
															}
															const updated = {
																...current,
																openingBalance: Math.round(next * 100) / 100
															};
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
																	updated.name,
																	updated.startDate,
																	updated.termYears,
																	updated.termMonths,
																	updated.mortgageAccountName,
																	updated.openingBalance
																)
															);
														}}
													/>
													{#if mortgageErrors[mortgage.id]?.openingBalance}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.openingBalance}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{:else if assetPanelTab === 'accounts'}
					<div class="mt-3 flex flex-wrap gap-2">
						<a
							href="/accounts/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add account
						</a>
					</div>
					<div class="mt-5 rounded-xl border border-slate-200 bg-white p-3">
						{#if accountsList.length > 0}
							<div class="overflow-x-auto">
								<table class="min-w-full divide-y divide-slate-200 text-xs">
									<thead class="bg-slate-50 text-left text-slate-500 uppercase">
										<tr>
											<th class="px-2 py-2">Start</th>
											<th class="px-2 py-2">Name</th>
											<th class="px-2 py-2">Opening balance</th>
											<th class="px-2 py-2">Interest rate</th>
											<th class="px-2 py-2">Account type</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-slate-100 text-slate-700">
										{#each accountsList as account}
											{@const draft = accountEditDrafts[account.id]}
											<tr>
												<td class="px-2 py-2">
													<input
														type="text"
														inputmode="numeric"
														pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
														class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
														value={draft?.startDate ?? toMonthYearInput(account.start_date)}
														on:input={(event) =>
															setAccountEditDraft(account.id, {
																startDate: (event.currentTarget as HTMLInputElement).value
															})}
														on:change={() =>
															scheduleUpdate(`account-edit:${account.id}`, () =>
																saveAccountEditDraft(account.id)
															)}
													/>
												</td>
												<td class="px-2 py-2">
													<input
														type="text"
														class="w-44 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
														value={draft?.name ?? account.name}
														on:input={(event) =>
															setAccountEditDraft(account.id, {
																name: (event.currentTarget as HTMLInputElement).value
															})}
														on:change={() =>
															scheduleUpdate(`account-edit:${account.id}`, () =>
																saveAccountEditDraft(account.id)
															)}
													/>
												</td>
												<td class="px-2 py-2">
													<input
														type="number"
														step="0.01"
														class="no-spin w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
														value={draft?.openingBalance ?? String(account.opening_balance)}
														on:input={(event) =>
															setAccountEditDraft(account.id, {
																openingBalance: (event.currentTarget as HTMLInputElement).value
															})}
														on:change={() =>
															scheduleUpdate(`account-edit:${account.id}`, () =>
																saveAccountEditDraft(account.id)
															)}
													/>
												</td>
												<td class="px-2 py-2">
													{#if account.account_type === 'super_account' || account.account_type === 'brokerage'}
														<span class="text-slate-400">—</span>
													{:else}
														<div class="flex items-center gap-1">
															<input
																type="number"
																class="no-spin w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
																value={formatRate(accountInterestRates[account.id] ?? 0, 2)}
																step="0.01"
																on:input={(event) => {
																	const next = Number(
																		(event.currentTarget as HTMLInputElement).value
																	);
																	const value = Number.isFinite(next) ? next : 0;
																	setAccountInterestRate(account.id, value);
																}}
																on:keydown={(event) => {
																	const keyboardEvent = event as KeyboardEvent;
																	if (keyboardEvent.key === 'ArrowUp') {
																		keyboardEvent.preventDefault();
																		adjustAccountInterestRate(account.id, 0.25);
																	}
																	if (keyboardEvent.key === 'ArrowDown') {
																		keyboardEvent.preventDefault();
																		adjustAccountInterestRate(account.id, -0.25);
																	}
																}}
																on:change={(event) => {
																	const next = Number(
																		(event.currentTarget as HTMLInputElement).value
																	);
																	const value = Number.isFinite(next) ? roundToTwo(next) : 0;
																	setAccountInterestRate(account.id, value);
																	scheduleUpdate(`account:${account.id}`, () =>
																		updateAccountInterestRate(account.id, value)
																	);
																}}
															/>
															<div class="flex flex-col items-end gap-0.5">
																<button
																	type="button"
																	class="grid h-3.5 w-5 place-items-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600 hover:bg-slate-50"
																	aria-label={`Increase ${account.name} interest rate`}
																	on:click={() => adjustAccountInterestRate(account.id, 0.25)}
																>
																	▲
																</button>
																<button
																	type="button"
																	class="grid h-3.5 w-5 place-items-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600 hover:bg-slate-50"
																	aria-label={`Decrease ${account.name} interest rate`}
																	on:click={() => adjustAccountInterestRate(account.id, -0.25)}
																>
																	▼
																</button>
															</div>
														</div>
													{/if}
												</td>
												<td class="px-2 py-2">{formatLabel(account.account_type)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if accountInlineError}
								<div class="mt-2 text-xs text-rose-600">{accountInlineError}</div>
							{/if}
						{:else}
							<div class="text-sm text-slate-600">No accounts to show yet.</div>
						{/if}
					</div>
				{:else if assetPanelTab === 'transfers'}
					<div class="mt-5 space-y-4">
						<div class="rounded-xl border border-slate-200 bg-white p-3">
							<h3 class="text-sm font-semibold text-slate-900">Existing transfers</h3>
							{#if transferCashflows.length === 0}
								<div class="mt-2 text-sm text-slate-600">No transfers configured.</div>
							{:else}
								<div class="mt-2 overflow-x-auto">
									<table class="min-w-full divide-y divide-slate-200 text-xs">
										<thead class="bg-slate-50 text-left text-slate-500 uppercase">
											<tr>
												<th class="px-2 py-2">From</th>
												<th class="px-2 py-2">To</th>
												<th class="px-2 py-2">Category</th>
												<th class="px-2 py-2">Inflation</th>
												<th class="px-2 py-2">Amount</th>
												<th class="px-2 py-2">Frequency</th>
												<th class="px-2 py-2">Start</th>
												<th class="px-2 py-2">End</th>
												<th class="px-2 py-2">Description</th>
												<th class="px-2 py-2"></th>
											</tr>
										</thead>
										<tbody class="divide-y divide-slate-100 text-slate-700">
											{#each transferCashflows as transfer}
												{@const transferDraftRow = transferEditDrafts[transfer.id]}
												<tr>
													<td class="px-2 py-2">
														<select
															class="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
															value={transferDraftRow?.sourceAccountId ??
																transfer.source_account_id ??
																''}
															on:change={(event) => {
																setTransferEditDraft(transfer.id, {
																	sourceAccountId: (event.currentTarget as HTMLSelectElement).value
																});
																scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																	saveTransferEditDraft(transfer.id)
																);
															}}
														>
															<option value="">Select account</option>
															{#each transferAccountOptions as option}
																<option value={option.id}>{option.name}</option>
															{/each}
														</select>
													</td>
													<td class="px-2 py-2">
														<select
															class="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
															value={transferDraftRow?.destinationAccountId ??
																transfer.destination_account_id ??
																''}
															on:change={(event) => {
																setTransferEditDraft(transfer.id, {
																	destinationAccountId: (event.currentTarget as HTMLSelectElement)
																		.value
																});
																scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																	saveTransferEditDraft(transfer.id)
																);
															}}
														>
															<option value="">Select account</option>
															{#each transferAccountOptions as option}
																<option value={option.id}>{option.name}</option>
															{/each}
														</select>
													</td>
													<td class="px-2 py-2">{formatLabel(transfer.category)}</td>
													<td class="px-2 py-2">
														<input
															type="checkbox"
															class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
															checked={transfer.inflation_affected}
															on:change={(event) => {
																const checked = (event.currentTarget as HTMLInputElement).checked;
																cashflows = cashflows.map((item) =>
																	item.id === transfer.id
																		? { ...item, inflation_affected: checked }
																		: item
																);
																updateTransferInflationAffected(transfer.id, checked);
															}}
														/>
													</td>
													<td class="px-2 py-2">
														<input
															type="number"
															min="0"
															step="0.01"
															class="no-spin w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
															value={transferDraftRow?.amount ?? String(transfer.amount)}
															on:input={(event) =>
																setTransferEditDraft(transfer.id, {
																	amount: (event.currentTarget as HTMLInputElement).value
																})}
															on:change={() =>
																scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																	saveTransferEditDraft(transfer.id)
																)}
														/>
													</td>
													<td class="px-2 py-2">
														<select
															class="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
															value={transferDraftRow?.frequency ?? transfer.frequency}
															on:change={(event) => {
																const nextFrequency = (event.currentTarget as HTMLSelectElement)
																	.value as 'monthly' | 'quarterly' | 'annually' | 'one_time';
																setTransferEditDraft(transfer.id, {
																	frequency: nextFrequency,
																	endDate:
																		nextFrequency === 'one_time'
																			? ''
																			: (transferDraftRow?.endDate ?? '')
																});
																scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																	saveTransferEditDraft(transfer.id)
																);
															}}
														>
															{#each cashflowFrequencyOptions as option}
																<option value={option.value}>{option.label}</option>
															{/each}
														</select>
													</td>
													<td class="px-2 py-2">
														<input
															type="text"
															inputmode="numeric"
															pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
															class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
															value={transferDraftRow?.startDate ??
																toMonthYearInput(transfer.start_date)}
															on:input={(event) =>
																setTransferEditDraft(transfer.id, {
																	startDate: (event.currentTarget as HTMLInputElement).value
																})}
															on:change={() =>
																scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																	saveTransferEditDraft(transfer.id)
																)}
														/>
													</td>
													<td class="px-2 py-2">
														{#if (transferDraftRow?.frequency ?? transfer.frequency) === 'one_time'}
															<span class="text-slate-400">—</span>
														{:else}
															<input
																type="text"
																inputmode="numeric"
																pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
																class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
																value={transferDraftRow?.endDate ??
																	toMonthYearInput(transfer.end_date)}
																on:input={(event) =>
																	setTransferEditDraft(transfer.id, {
																		endDate: (event.currentTarget as HTMLInputElement).value
																	})}
																on:change={() =>
																	scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																		saveTransferEditDraft(transfer.id)
																	)}
															/>
														{/if}
													</td>
													<td class="px-2 py-2">
														<input
															type="text"
															class="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
															value={transferDraftRow?.description ?? transfer.description ?? ''}
															on:input={(event) =>
																setTransferEditDraft(transfer.id, {
																	description: (event.currentTarget as HTMLInputElement).value
																})}
															on:change={() =>
																scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
																	saveTransferEditDraft(transfer.id)
																)}
														/>
													</td>
													<td class="px-2 py-2 text-right">
														<button
															type="button"
															class="text-rose-500 hover:text-rose-600"
															aria-label="Delete transfer"
															title="Delete transfer"
															on:click={() => requestDeleteCashflow(transfer.id)}
														>
															<svg
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
																stroke-linecap="round"
																stroke-linejoin="round"
																class="h-4 w-4"
															>
																<path d="M3 6h18" />
																<path d="M8 6V4h8v2" />
																<path d="M6 6l1 14h10l1-14" />
																<path d="M10 11v6" />
																<path d="M14 11v6" />
															</svg>
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								{#if transferInlineError}
									<div class="mt-2 text-xs text-rose-600">{transferInlineError}</div>
								{/if}
							{/if}
						</div>

						<div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
							<h3 class="text-sm font-semibold text-slate-900">New transfer</h3>
							<div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								<label class="text-xs text-slate-600">
									<span class="mb-1 block text-slate-500">From account</span>
									<select
										class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={transferDraft.sourceAccountId}
										on:change={(event) => {
											transferDraft = {
												...transferDraft,
												sourceAccountId: (event.currentTarget as HTMLSelectElement).value
											};
										}}
									>
										<option value="">Select account</option>
										{#each transferAccountOptions as option}
											<option value={option.id}>{option.name}</option>
										{/each}
									</select>
								</label>
								<label class="text-xs text-slate-600">
									<span class="mb-1 block text-slate-500">To account</span>
									<select
										class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={transferDraft.destinationAccountId}
										on:change={(event) => {
											transferDraft = {
												...transferDraft,
												destinationAccountId: (event.currentTarget as HTMLSelectElement).value
											};
										}}
									>
										<option value="">Select account</option>
										{#each transferAccountOptions as option}
											<option value={option.id}>{option.name}</option>
										{/each}
									</select>
								</label>
								<label class="text-xs text-slate-600">
									<span class="mb-1 block text-slate-500">Amount</span>
									<input
										type="number"
										min="0"
										step="0.01"
										class="no-spin w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={transferDraft.amount}
										on:input={(event) => {
											transferDraft = {
												...transferDraft,
												amount: (event.currentTarget as HTMLInputElement).value
											};
										}}
									/>
								</label>
								<label class="text-xs text-slate-600">
									<span class="mb-1 block text-slate-500">Frequency</span>
									<select
										class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={transferDraft.frequency}
										on:change={(event) => {
											const nextFrequency = (event.currentTarget as HTMLSelectElement).value as
												| 'monthly'
												| 'quarterly'
												| 'annually'
												| 'one_time';
											transferDraft = {
												...transferDraft,
												frequency: nextFrequency,
												endDate: nextFrequency === 'one_time' ? '' : transferDraft.endDate
											};
										}}
									>
										{#each cashflowFrequencyOptions as option}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</label>
								<label class="text-xs text-slate-600">
									<span class="mb-1 block text-slate-500">Start date (MM YYYY)</span>
									<input
										type="text"
										inputmode="numeric"
										pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
										class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={transferDraft.startDate}
										on:input={(event) => {
											transferDraft = {
												...transferDraft,
												startDate: (event.currentTarget as HTMLInputElement).value
											};
										}}
									/>
								</label>
								{#if transferDraft.frequency !== 'one_time'}
									<label class="text-xs text-slate-600">
										<span class="mb-1 block text-slate-500">End date (optional)</span>
										<input
											type="text"
											inputmode="numeric"
											pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
											class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={transferDraft.endDate}
											on:input={(event) => {
												transferDraft = {
													...transferDraft,
													endDate: (event.currentTarget as HTMLInputElement).value
												};
											}}
										/>
									</label>
								{/if}
								<label class="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
									<span class="mb-1 block text-slate-500">Inflation affected</span>
									<label class="inline-flex items-center gap-2">
										<input
											type="checkbox"
											class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
											checked={transferDraft.inflationAffected}
											on:change={(event) => {
												transferDraft = {
													...transferDraft,
													inflationAffected: (event.currentTarget as HTMLInputElement).checked
												};
											}}
										/>
										<span class="text-xs text-slate-700">Apply inflation over time</span>
									</label>
								</label>
								<label class="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
									<span class="mb-1 block text-slate-500">Description (optional)</span>
									<input
										type="text"
										class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={transferDraft.description}
										on:input={(event) => {
											transferDraft = {
												...transferDraft,
												description: (event.currentTarget as HTMLInputElement).value
											};
										}}
									/>
								</label>
							</div>
							{#if transferFormError}
								<div class="mt-2 text-xs text-rose-600">{transferFormError}</div>
							{/if}
							<div class="mt-3 flex justify-end">
								<button
									type="button"
									class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
									disabled={transferAccountOptions.length < 2}
									on:click={createTransferCashflow}
								>
									Add transfer
								</button>
							</div>
						</div>
					</div>
				{:else if assetPanelTab === 'reserves'}
					<div class="mt-5 space-y-4">
						{#if fundingCashAccountOptions.length === 0}
							<div class="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
								No eligible cash accounts available yet.
							</div>
						{:else}
							<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
								<table class="min-w-full divide-y divide-slate-200 text-xs">
									<thead class="bg-slate-50 text-left uppercase text-slate-500">
										<tr>
											<th class="px-2 py-2 text-slate-600 normal-case">Cash accounts</th>
											{#each fundingCashAccountOptions as account (account.id)}
												<th class="px-2 py-2 text-slate-700 normal-case">{account.name}</th>
											{/each}
										</tr>
									</thead>
									<tbody class="divide-y divide-slate-100 text-slate-700">
										<tr>
											<td class="px-2 py-2 font-semibold text-slate-600">Reserve amount</td>
											{#each fundingCashAccountOptions as account (account.id)}
												<td class="px-2 py-2">
													<input
														id={`reserve-amount-input-${account.id}`}
														type="number"
														class="w-full min-w-[120px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
														value={fundingReserveDrafts[account.id] ?? '0'}
														on:input={(event) =>
															(fundingReserveDrafts = {
																...fundingReserveDrafts,
																[account.id]: (event.currentTarget as HTMLInputElement).value
															})}
														on:change={() =>
															scheduleUpdate(`funding-target:${account.id}`, () =>
																upsertFundingTargetForAccount(account.id)
															)}
													/>
												</td>
											{/each}
										</tr>
										<tr>
											<td
												colspan={fundingCashAccountOptions.length + 1}
												class="px-2 py-2 text-xs text-sky-800"
											>
												Select the assets or accounts to fund the account from once it falls below its reserve.
											</td>
										</tr>
										{#each Array.from({ length: fundingReservePriorityRowCount }) as _, priorityIndex (priorityIndex)}
											{@const priority = priorityIndex + 1}
											<tr>
												<td class="px-2 py-2 font-semibold text-slate-600">
													Funding source priority {priority}
												</td>
												{#each fundingCashAccountOptions as account (account.id)}
													{@const accountReserveRules = fundingReserveRulesByAccount[account.id] ?? []}
													{@const rule = accountReserveRules[priorityIndex] ?? null}
													{@const canSelectSource = priorityIndex === 0 || Boolean(accountReserveRules[priorityIndex - 1])}
													{@const availableReserveSourceOptions =
														fundingReserveSourceOptionsByAccount[account.id] ?? []}
													<td class="px-2 py-2">
														{#if rule}
															{@const sourceName =
																transferAccountOptions.find(
																	(item) => item.id === rule.source_account_id
																)?.name ?? 'Source account'}
															<div class="flex min-w-[160px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
																<span class="flex-1 truncate">{sourceName}</span>
																<button
																	type="button"
																	class="px-1 text-slate-500 disabled:opacity-30"
																	disabled={priority === 1}
																	on:click={() => moveReserveRule(account.id, rule.id, -1)}
																>
																	↑
																</button>
																<button
																	type="button"
																	class="px-1 text-slate-500 disabled:opacity-30"
																	disabled={priorityIndex === accountReserveRules.length - 1}
																	on:click={() => moveReserveRule(account.id, rule.id, 1)}
																>
																	↓
																</button>
																<button
																	type="button"
																	class="px-1 text-rose-600"
																	on:click={() => removeReserveRule(rule.id)}
																>
																	✕
																</button>
															</div>
														{:else if canSelectSource && availableReserveSourceOptions.length > 0}
															<select
																class="w-full min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
																value=""
																on:change={(event) => {
																	const selectedSource = (event.currentTarget as HTMLSelectElement).value;
																	if (selectedSource) {
																		void addReserveRuleForTarget(account.id, selectedSource);
																		(event.currentTarget as HTMLSelectElement).value = '';
																	}
																}}
															>
																<option value="">Select source…</option>
																{#each availableReserveSourceOptions as option}
																	<option value={option.id}>{option.name}</option>
																{/each}
															</select>
														{:else if canSelectSource}
															<div class="min-w-[160px] text-center text-slate-400">
																No more funding sources available
															</div>
														{:else}
															<div class="min-w-[160px] text-center text-slate-400">-</div>
														{/if}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if fundingTabError}
								<div class="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
									{fundingTabError}
								</div>
							{/if}
						{/if}
					</div>
				{:else if assetPanelTab === 'caps'}
					<div class="mt-5 space-y-4">
						{#if fundingCashAccountOptions.length === 0}
							<div class="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
								No eligible cash accounts available yet.
							</div>
						{:else}
							<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
								<table class="min-w-full divide-y divide-slate-200 text-xs">
									<thead class="bg-slate-50 text-left uppercase text-slate-500">
										<tr>
											<th class="px-2 py-2 text-slate-600 normal-case">Cash accounts</th>
											{#each fundingCashAccountOptions as account (account.id)}
												<th class="px-2 py-2 text-slate-700 normal-case">{account.name}</th>
											{/each}
										</tr>
									</thead>
									<tbody class="divide-y divide-slate-100 text-slate-700">
										<tr>
											<td class="px-2 py-2 font-semibold text-slate-600">Cap amount</td>
											{#each fundingCashAccountOptions as account (account.id)}
												<td class="px-2 py-2">
													<input
														id={`cap-amount-input-${account.id}`}
														type="number"
														class="w-full min-w-[120px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
														value={fundingCapDrafts[account.id] ?? ''}
														on:input={(event) =>
															(fundingCapDrafts = {
																...fundingCapDrafts,
																[account.id]: (event.currentTarget as HTMLInputElement).value
															})}
														on:change={() =>
															scheduleUpdate(`funding-target:${account.id}`, () =>
																upsertFundingTargetForAccount(account.id)
															)}
													/>
												</td>
											{/each}
										</tr>
										<tr>
											<td
												colspan={fundingCashAccountOptions.length + 1}
												class="px-2 py-2 text-xs text-sky-800"
											>
												Once the account has reached its cap, select the assets or accounts to fund in order. Select at least one destination before entering the cap.
											</td>
										</tr>
										{#each Array.from({ length: fundingCapPriorityRowCount }) as _, priorityIndex (priorityIndex)}
											{@const priority = priorityIndex + 1}
											<tr>
												<td class="px-2 py-2 font-semibold text-slate-600">
													Funding destination priority {priority}
												</td>
												{#each fundingCashAccountOptions as account (account.id)}
													{@const accountSweepRules = fundingSweepRulesByAccount[account.id] ?? []}
													{@const rule = accountSweepRules[priorityIndex] ?? null}
													{@const canSelectDestination = priorityIndex === 0 || Boolean(accountSweepRules[priorityIndex - 1])}
													{@const capAmountEntered = (fundingCapDrafts[account.id] ?? '').trim().length > 0}
													{@const showCapDestinationWarning =
														priorityIndex === 0 && capAmountEntered && !accountSweepRules[0]}
													{@const availableSweepDestinationOptions =
														fundingSweepDestinationOptionsByAccount[account.id] ?? []}
													<td class="px-2 py-2">
														{#if rule}
															{@const destinationName =
																transferAccountOptions.find(
																	(item) => item.id === rule.destination_account_id
																)?.name ?? 'Destination account'}
															<div class="flex min-w-[160px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
																<span class="flex-1 truncate">{destinationName}</span>
																<button
																	type="button"
																	class="px-1 text-slate-500 disabled:opacity-30"
																	disabled={priority === 1}
																	on:click={() => moveSweepRule(account.id, rule.id, -1)}
																>
																	↑
																</button>
																<button
																	type="button"
																	class="px-1 text-slate-500 disabled:opacity-30"
																	disabled={priorityIndex === accountSweepRules.length - 1}
																	on:click={() => moveSweepRule(account.id, rule.id, 1)}
																>
																	↓
																</button>
																<button
																	type="button"
																	class="px-1 text-rose-600"
																	on:click={() => removeSweepRule(rule.id)}
																>
																	✕
																</button>
															</div>
														{:else if canSelectDestination && availableSweepDestinationOptions.length > 0}
															<select
																class="w-full min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
																value=""
																on:change={(event) => {
																	const selectedDestination = (event.currentTarget as HTMLSelectElement).value;
																	if (selectedDestination) {
																		void addSweepRuleForSource(account.id, selectedDestination);
																		(event.currentTarget as HTMLSelectElement).value = '';
																	}
																}}
															>
																<option value="">Select destination…</option>
																{#each availableSweepDestinationOptions as option}
																	<option value={option.id}>{option.name}</option>
																{/each}
															</select>
														{:else if canSelectDestination}
															<div class="min-w-[160px] text-center text-slate-400">
																No more funding destinations available
															</div>
														{:else}
															<div class="min-w-[160px] text-center text-slate-400">-</div>
														{/if}
														{#if showCapDestinationWarning}
															<div class="mt-1 text-[11px] text-rose-600">
																Please choose where excess funds should be allocated for cap to take effect.
															</div>
														{/if}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if fundingTabError}
								<div class="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
									{fundingTabError}
								</div>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		</div>
		<div class="space-y-4">
			<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<h3 class="text-sm font-semibold text-slate-900">Funding Planner</h3>
				<div
					class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${stage1Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
				>
					<div class="flex items-center gap-2">
						<span class="font-semibold">Stage 1: Liquidity</span>
						<span class="group relative inline-flex">
							<button
								type="button"
								class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
								aria-label="What is Stage 1 liquidity?"
							>
								i
							</button>
							<span
								role="tooltip"
								class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
							>
								Stage 1 checks whether you are living within your means by seeing if you run out of
								accessible money in any month. Accessible money is in either cash accounts, shares
								or pension/superannuation funds (if available).
							</span>
						</span>
					</div>
					<span
						class={`rounded-full px-2 py-0.5 font-semibold ${stage1Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
					>
						{stage1Passed ? '✓' : '✕'}
					</span>
				</div>
				{#if stage1Passed}
					<div class="mt-2 text-xs text-emerald-700">You are living within your means.</div>
				{/if}
				{#if plannerStage === 'liquidity'}
					<div
						class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
					>
						{stage1PlannerMessage}
					</div>
					<div
						class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
					>
						<div class="font-semibold">Fix Liquidity First</div>
						<div class="mt-1 text-xs">
							You need to reduce your expenses or increase your income to ensure your liquidity.
						</div>
						<div class="mt-3 text-xs font-semibold">Ways you can fix your liquidity:</div>
						<ul class="mt-2 list-disc pl-5 text-xs">
							<li>Reduce or remove expenses.</li>
							<li>Increase income or add an income stream.</li>
							<li>Add an income generating asset.</li>
							<li>
								Sell an asset to bring in income{assetsList.some(
									(asset) => asset.asset_type === 'property'
								)
									? ' (e.g. property).'
									: '.'}
							</li>
						</ul>
						<div class="mt-2 text-xs">
							Head down to the
							<a
								href="#what-if-panel"
								class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
								on:click|preventDefault={jumpToWhatIfAssetsExpense}
							>
								What if?...
							</a>
							section below to make your changes.
						</div>
					</div>
				{/if}

				<div
					class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${!stage2Reached ? 'border-slate-200 bg-slate-50 text-slate-500' : stage2Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
				>
					<div class="flex items-center gap-2">
						<span class="font-semibold">Stage 2: Allocation</span>
						<span class="group relative inline-flex">
							<button
								type="button"
								class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
								aria-label="What is Stage 2 allocation?"
							>
								i
							</button>
							<span
								role="tooltip"
								class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
							>
								Now that we've established you have enough to live on we need to ensure all of your
								accounts remain in the black. Stage 2 is about allocating funds to the right
								accounts at the right time.
							</span>
						</span>
					</div>
					<span
						class={`rounded-full px-2 py-0.5 font-semibold ${!stage2Reached ? 'bg-slate-100 text-slate-500' : stage2Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
					>
						{!stage2Reached ? '?' : stage2Passed ? '✓' : '✕'}
					</span>
				</div>
				{#if stage2Passed}
					<div class="mt-2 text-xs text-emerald-700">None of your accounts run out of money.</div>
				{/if}
				{#if stage2Reached && !stage2Passed}
					<div
						class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
					>
						{stage2PlannerMessage}
					</div>
					{#if stage2AllocationShortfall}
						<div
							class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
						>
							<div class="font-semibold">
								Stage 2: Allocation for {stage2AllocationShortfall.targetAccountName} from {stage2AllocationShortfall.monthLabel}
								from which account...
							</div>
							{#if (plannerExistingRules?.length ?? 0) > 0}
								<div class="mt-2 space-y-1 text-xs">
									{#each plannerExistingRules ?? [] as rule}
										{@const sourceAccountName =
											accountsList.find((account) => account.id === rule.source_account_id)?.name ??
											'Source account'}
										<div
											class="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1"
										>
											<span>Priority {rule.priority_order}: {sourceAccountName}</span>
											<button
												type="button"
												class="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
												on:click={() => removeAutoFundingRule(rule.id)}
											>
												Remove
											</button>
										</div>
									{/each}
								</div>
							{/if}
							<div class="mt-2 block text-xs text-slate-600">
								<select
									class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
									value={plannerSourceAccountId}
									on:change={(event) =>
										(plannerSourceAccountId = (event.currentTarget as HTMLSelectElement).value)}
								>
									{#if plannerSourceOptions.length === 0}
										<option value="">No valid funding accounts</option>
									{:else}
										<option value="">Add next funding account...</option>
										{#each plannerSourceOptions as option}
											<option value={option.id}>{option.name}</option>
										{/each}
									{/if}
								</select>
							</div>
							{#if plannerSourceAvailabilityWarning}
								<div
									class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
								>
									{plannerSourceAvailabilityWarning}
								</div>
							{/if}
							<div class="mt-2">
								<button
									type="button"
									class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
									disabled={!plannerSourceAccountId || plannerSourceOptions.length === 0}
									on:click={saveAutoFundingRule}
								>
									Add Funding Account
								</button>
							</div>
							{#if autoFundingRuleError}
								<div class="mt-2 text-xs text-rose-600">{autoFundingRuleError}</div>
							{/if}
						</div>
					{:else}
						<div
							class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
						>
							Stage 2 is active. Review auto-funding priorities until account runout is resolved.
						</div>
					{/if}
				{/if}

				<div
					role="button"
					tabindex="0"
					on:click={() => (plannerAdvancedOpenStage = 'stage3')}
					on:keydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							plannerAdvancedOpenStage = 'stage3';
						}
					}}
					class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${!stage3Reached ? 'border-slate-200 bg-slate-50 text-slate-500' : stage3Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
				>
					<div class="flex items-center gap-2">
						<span class="font-semibold">Stage 3: Safety</span>
						<span class="group relative inline-flex">
							<button
								type="button"
								class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
								aria-label="What is Stage 3 safety?"
							>
								i
							</button>
							<span
								role="tooltip"
								class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
							>
								Stage 3 sets reserve minimums so essential spending is protected. This stage focuses
								on safety buffer and resilience.
							</span>
						</span>
					</div>
					<span
						class={`rounded-full px-2 py-0.5 font-semibold ${!stage3Reached ? 'bg-slate-100 text-slate-500' : stage3Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
					>
						{!stage3Reached ? '?' : stage3Passed ? '✓' : '!'}
					</span>
				</div>
				{#if stage3Passed}
					<div class="mt-2 text-xs text-emerald-700">
						Your reserves and resilience are in a healthy range.
					</div>
				{/if}
				{#if stage3Reached && plannerAdvancedOpenStage === 'stage3'}
					{#if stage3Assessment}
						<div class="mt-3 space-y-2 text-xs text-sky-900">
							<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
									<div class="flex items-center gap-1">
										<span class="font-semibold">Safety Buffer Score</span>
										<span class="group relative inline-flex">
											<button
												type="button"
												class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
												aria-label="What is the Stage 3 safety buffer score?"
											>
												i
											</button>
											<span
												role="tooltip"
												class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-teal-50 px-2 py-1.5 text-[11px] leading-relaxed text-sky-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
											>
												Measures how many months you could survive on your liquid buffer given living
												expenses, asset ownership expenses and mortgage repayments. Current coverage is
												{Math.floor(stage3Assessment.safetyMonths)} months.
											</span>
										</span>
									</div>
									<span class="font-semibold">{stage3Assessment.safetyScore}/100</span>
							</div>
							<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
									<div class="flex items-center gap-1">
										<span class="font-semibold">Resilience Score</span>
										<span class="group relative inline-flex">
											<button
												type="button"
												class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
												aria-label="What is the Stage 3 resilience score?"
											>
												i
											</button>
											<span
												role="tooltip"
												class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-teal-50 px-2 py-1.5 text-[11px] leading-relaxed text-sky-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
											>
												Measures the largest drop in liquidity over any rolling 12-month window in
												your projection. Worst window:
												{stage3Assessment.worstDrawdownStartDate
													? monthLabelFromDate(stage3Assessment.worstDrawdownStartDate)
													: 'N/A'}{' '}
												to{' '}
												{stage3Assessment.worstDrawdownEndDate
													? monthLabelFromDate(stage3Assessment.worstDrawdownEndDate)
													: 'N/A'}
												, drawdown: {stage3Assessment.worstDrawdownPct}%. Formula: 100 - (drawdown%
												x 2), clamped 0 to 100.
											</span>
										</span>
									</div>
									<span class="font-semibold">{stage3Assessment.resilienceScore}/100</span>
							</div>
						</div>
					{/if}
					<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
						<div class="font-semibold">Set Reserve Settings In What If</div>
						<div class="mt-1 text-xs">
							Use the Reserves tab in the What if?... section to set reserve amounts and funding
							source priorities.
						</div>
						<div class="mt-2 text-xs">
							Head down to the
							<a
								href="#what-if-panel"
								class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
								on:click|preventDefault={jumpToWhatIfReserves}
							>
								What if?...
							</a>
							section below to make your changes.
						</div>
					</div>
				{/if}

				<div
					role="button"
					tabindex="0"
					on:click={() => (plannerAdvancedOpenStage = 'stage4')}
					on:keydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							plannerAdvancedOpenStage = 'stage4';
						}
					}}
					class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${!stage4Reached ? 'border-slate-200 bg-slate-50 text-slate-500' : stage4Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
				>
					<div class="flex items-center gap-2">
						<span class="font-semibold">Stage 4: Growth Efficiency</span>
						<span class="group relative inline-flex">
							<button
								type="button"
								class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
								aria-label="What is Stage 4 growth efficiency?"
							>
								i
							</button>
							<span
								role="tooltip"
								class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
							>
								Stage 4 sets cap and sweep settings so excess cash can move to growth assets while
								still respecting reserves. This stage focuses on growth allocation and goal match.
							</span>
						</span>
					</div>
					<span
						class={`rounded-full px-2 py-0.5 font-semibold ${!stage4Reached ? 'bg-slate-100 text-slate-500' : stage4Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
					>
						{!stage4Reached ? '?' : stage4Passed ? '✓' : '!'}
					</span>
				</div>
				{#if stage4Passed}
					<div class="mt-2 text-xs text-emerald-700">
						Your cap settings support growth and match your horizon.
					</div>
				{/if}
				{#if stage3Reached && plannerAdvancedOpenStage === 'stage4'}
					{#if !stage4Reached}
						<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
							Complete Stage 3 safety targets first to unlock Stage 4.
						</div>
					{:else}
						{#if stage3Assessment}
							<div class="mt-3 space-y-2 text-xs text-sky-900">
									<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
										<div class="flex items-center gap-1">
											<span class="font-semibold">Growth Allocation Score</span>
											<span class="group relative inline-flex">
												<button
													type="button"
													class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
													aria-label="What is the Stage 4 growth allocation score?"
												>
													i
												</button>
												<span
													role="tooltip"
													class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-teal-50 px-2 py-1.5 text-[11px] leading-relaxed text-sky-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
												>
													Shows how much of current value is in growth assets (shares, super, property)
													versus defensive cash. Current growth allocation is
													{stage3Assessment.growthAllocationPct}%.
												</span>
											</span>
										</div>
										<span class="font-semibold">{stage3Assessment.growthScore}/100</span>
									</div>
									<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
										<div class="flex items-center gap-1">
											<span class="font-semibold">Goal Match Score</span>
											<span class="group relative inline-flex">
												<button
													type="button"
													class="grid h-4 w-4 place-items-center rounded-full border border-current/30 bg-white/80 text-[10px] leading-none font-bold"
													aria-label="What is the Stage 4 goal match score?"
												>
													i
												</button>
												<span
													role="tooltip"
													class="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-teal-50 px-2 py-1.5 text-[11px] leading-relaxed text-sky-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
												>
													Checks whether growth allocation fits your projection horizon. Current horizon
													is {stage3Assessment.horizonMonths} months.
												</span>
											</span>
										</div>
										<span class="font-semibold">{stage3Assessment.goalMatchScore}/100</span>
									</div>
								<div class="text-[11px] text-sky-800">
									Current profile: {stage3Assessment.profile} ({stage3Assessment.totalScore}/100).
								</div>
							</div>
						{/if}
						{#if !stage4Passed}
							<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
								<div class="font-semibold">Set Cap Settings In What If</div>
								<div class="mt-1 text-xs">
									Use the Caps tab in the What if?... section to set cap amounts and funding destination
									priorities.
								</div>
								<div class="mt-2 text-xs">
									Head down to the
									<a
										href="#what-if-panel"
										class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
										on:click|preventDefault={jumpToWhatIfCaps}
									>
										What if?...
									</a>
									section below to make your changes.
								</div>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
			{#if (projectionData.events?.length ?? 0) > 0}
				<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h3 class="text-sm font-semibold text-slate-900">Events</h3>
					<div class="mt-3 space-y-2">
						{#each projectionData.events as event}
							<div
								class={`rounded-lg border px-3 py-2 text-xs ${
									event.tone === 'negative'
										? 'border-rose-200 bg-rose-50 text-rose-700'
										: 'border-emerald-200 bg-emerald-50 text-emerald-700'
								}`}
							>
								{event.monthLabel ? `${event.monthLabel}: ${event.message}` : event.message}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>

{#if deleteConfirmId}
	<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 px-4">
		<div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
			<h3 class="text-sm font-semibold text-slate-900">Delete cashflow?</h3>
			<p class="mt-2 text-xs text-slate-600">
				This cashflow will be permanently removed from the scenario.
			</p>
			<div class="mt-4 flex items-center justify-end gap-2">
				<button
					type="button"
					class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
					on:click={cancelDeleteCashflow}
				>
					Cancel
				</button>
				<button
					type="button"
					class="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
					on:click={confirmDeleteCashflow}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.assets-cards input,
	.assets-cards select {
		font-size: 0.75rem;
		line-height: 1rem;
	}

	.no-spin::-webkit-outer-spin-button,
	.no-spin::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.no-spin {
		appearance: textfield;
		-moz-appearance: textfield;
	}
</style>


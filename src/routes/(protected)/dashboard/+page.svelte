<script lang="ts">
	import type { PageData } from './$types';
	import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
	import Chart from 'chart.js/auto';
	import { formatYearMonthInput, normalizeYearMonthValue } from '$lib/yearMonth';
	import { postAction } from '$lib/dashboard/action-client';
	import {
		fetchDashboardProjection,
		fetchDashboardWhatIf,
		runInitialDashboardLoad
	} from '$lib/dashboard/dashboard-data-orchestrator';
	import { createDashboardMutationController } from '$lib/dashboard/dashboard-mutations-controller';
	import {
		createDashboardSectionsController,
		type DashboardSectionsControllerState
	} from '$lib/dashboard/dashboard-controller';
	import { buildDashboardProjectionDerived } from '$lib/dashboard/dashboard-projection-controller';
	import {
		createDashboardLoadStateStore,
		createDashboardProjectionStateStore,
		createDashboardUiStateStore,
		createDashboardWhatIfStateStore,
		createDashboardScenarioResetState
	} from '$lib/dashboard/dashboard-view-state';
	import {
		isValidMonthYearInput,
		normalizeProjectionRange,
		stepForValue
	} from '$lib/dashboard/ui-helpers';
	import {
		coerceDraftForAssetType,
		createDefaultCashflowDraft,
		createEditCashflowDraft
	} from '$lib/dashboard/cashflow-drafts';
	import { applyReserveOrderOverrides as applyReserveOrderOverridesToRules } from '$lib/dashboard/funding-order';
	import {
		calculateStage3Assessment,
		findStage2RunOutEvent,
		getPlannerExistingRules,
		getPlannerLiquiditySaleShortcut,
		getPlannerSourceAvailabilityWarning,
		getPlannerSourceOptions,
		getStage2AccessibilityShortfall
	} from '$lib/dashboard/planner-logic';
	import {
		buildLiquidityIncomeDraftPatch,
		buildLiquidityPropertySaleDetails,
		buildLiquidityTransferDraft,
		findBestLiquidityExpenseShortcut,
		findFirstPersonAssetId,
		findFirstPropertyAsset,
		PLANNER_LIQUIDITY_ERRORS
	} from '$lib/dashboard/planner-actions';
	import { jumpToWhatIfFundingInput } from '$lib/dashboard/planner-commands';
	import type {
		AccountEditDraft,
		AccountOption,
		AssetPanelTab,
		ChartSeries,
		CashflowDraft,
		CashflowSummary,
		ProjectionBalanceSource,
		ProjectionRange,
		ProjectionView,
		Stage3Assessment,
		TransferDraft,
		TransferEditDraft,
		TransactionSortDirection,
		TransactionSortKey
	} from '$lib/dashboard/types';
	import DisclosureToggle from '$lib/components/ui/DisclosureToggle.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import CashflowDraftForm from '$lib/components/dashboard/CashflowDraftForm.svelte';
	import ProjectionPanel from '$lib/components/dashboard/sections/ProjectionPanel.svelte';
	import WhatIfPanel from '$lib/components/dashboard/sections/WhatIfPanel.svelte';
	import PlannerPanel from '$lib/components/dashboard/sections/PlannerPanel.svelte';

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

	type ProjectionData = PageData['projection'];
	type AssetItem = PageData['assets'][number];
	type AccountItem = PageData['accounts'][number];
	type AssetAccountItem = PageData['assetAccounts'][number];
	type AutoFundingRuleItem = PageData['autoFundingRules'][number];
	type AccountBalanceTargetItem = PageData['accountBalanceTargets'][number];
	type AutoSweepRuleItem = PageData['autoSweepRules'][number];

	const EMPTY_PROJECTION: ProjectionData = {
		startDate: 0,
		endDate: 0,
		accounts: [],
		assets: [],
		transactions: [],
		events: [],
		liquidity: {
			points: [],
			series: []
		},
		planner: {
			stage: 'reserves_caps',
			status: 'on_track',
			headline: '',
			firstLiquidityDeficit: null,
			hasCapBreach: false,
			firstShortfall: null
		}
	};

	const dashboardProjectionState = createDashboardProjectionStateStore<
		ProjectionData,
		PageData['sessionRates'],
		ProjectionRange
	>({
		projectionData: data.projection ?? EMPTY_PROJECTION,
		sessionRates: data.sessionRates,
		projectionRange: normalizeProjectionRange(data.projectionRange),
		projectionVersion: 1
	});
	let projectionData: ProjectionData;
	let sessionRates: PageData['sessionRates'];
	let projectionRange: ProjectionRange;
	let projectionVersion: number;
	$: projectionData = $dashboardProjectionState.projectionData;
	$: sessionRates = $dashboardProjectionState.sessionRates;
	$: projectionRange = $dashboardProjectionState.projectionRange;
	$: projectionVersion = $dashboardProjectionState.projectionVersion;
	let refreshProjectionRequestId = 0;
	const dashboardWhatIfState = createDashboardWhatIfStateStore<
		AssetItem,
		AccountItem,
		AssetAccountItem,
		CashflowSummary,
		AutoFundingRuleItem,
		AccountBalanceTargetItem,
		AutoSweepRuleItem
	>({
		assetsList: data.assets ?? [],
		accountsList: data.accounts ?? [],
		assetAccountsList: data.assetAccounts ?? [],
		cashflows: data.cashflows ?? [],
		autoFundingRules: data.autoFundingRules ?? [],
		accountBalanceTargets: data.accountBalanceTargets ?? [],
		autoSweepRules: data.autoSweepRules ?? []
	});
	let cashflows: CashflowSummary[];
	let assetsList: AssetItem[];
	let accountsList: AccountItem[];
	let assetAccountsList: AssetAccountItem[];
	let autoFundingRules: AutoFundingRuleItem[];
	let accountBalanceTargets: AccountBalanceTargetItem[];
	let autoSweepRules: AutoSweepRuleItem[];
	$: assetsList = $dashboardWhatIfState.assetsList;
	$: accountsList = $dashboardWhatIfState.accountsList;
	$: assetAccountsList = $dashboardWhatIfState.assetAccountsList;
	$: cashflows = $dashboardWhatIfState.cashflows;
	$: autoFundingRules = $dashboardWhatIfState.autoFundingRules;
	$: accountBalanceTargets = $dashboardWhatIfState.accountBalanceTargets;
	$: autoSweepRules = $dashboardWhatIfState.autoSweepRules;
	let autoRunProjection = true;
	let whatIfPanelElement: HTMLElement | null = null;
	const dashboardLoadState = createDashboardLoadStateStore();
	const setProjectionError = (message: string | null) =>
		dashboardLoadState.setProjectionError(message);
	const setWhatIfLoadError = (message: string | null) =>
		dashboardLoadState.setWhatIfLoadError(message);
	const dashboardUiState = createDashboardUiStateStore();

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

	let projectionView: ProjectionView = 'balances';
	let projectionBalanceSource: ProjectionBalanceSource = 'liquidity';
	let assetPanelTab: AssetPanelTab = 'assets';
	let isUpdating = false;
	let updateLocks = new Set<string>();
	let expandedPnlNodes = new Set<string>();
	let reserveOrderOverridesByTarget: Record<string, string[]> = {};
	let fundingReserveDrafts: Record<string, string> = {};
	let fundingCapDrafts: Record<string, string> = {};
	let fundingCashAccountOptions: AccountOption[] = [];
	let fundingReserveRulesByAccount: Record<string, typeof autoFundingRules> = {};
	let fundingReserveSourceOptionsByAccount: Record<string, AccountOption[]> = {};
	let fundingReservePriorityRowCount = 1;
	let fundingSweepRulesByAccount: Record<string, typeof autoSweepRules> = {};
	let fundingSweepDestinationOptionsByAccount: Record<string, AccountOption[]> = {};
	let fundingCapPriorityRowCount = 1;
	let fundingTabError = '';
	let transactionSortKey: TransactionSortKey = 'assetName';
	let transactionSortDirection: TransactionSortDirection = 'asc';
	let pnlExpandableNodeIds: string[] = [];
	let isAllPnlExpanded = false;
	let personRetirementAges: Record<string, number> = {};
	let personDetails: Record<string, { name: string; startDate: string; dob: string }> = {};
	let cashflowAmounts: Record<string, number> = {};
	let propertyDetails: Record<
		string,
		{
			name: string;
			startDate: string;
			propertyUse: import('$lib/dashboard/types').PropertyUse;
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
	let superDetails: Record<
		string,
		{
			preservationAge: number;
			capitalGrowthRate: number;
			managementFeeRate: number;
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
	let cashflowFormErrors: Record<string, string>;
	let lastScenarioId = data.scenario.id;
	let updateTimers: Record<string, ReturnType<typeof setTimeout>> = {};
	let activeCashflowForm: {
		assetId: string;
		type: 'income' | 'expense';
		cashflowId?: string;
	} | null;
	let cashflowDrafts: Record<string, CashflowDraft>;
	let cashflowsByAssetId: Record<string, CashflowSummary[]> = {};
	let editingCashflowIds = new Set<string>();
	let expandedPersonDetailIds: Set<string>;
	let expandedPropertyDetailIds: Set<string>;
	let expandedMortgageDetailIds: Set<string>;
	let expandedShareDetailIds: Set<string>;
	let deleteConfirmId: string | null = null;
	let transferFormError: string;
	let transferInlineError: string;
	let transferDraft: TransferDraft;
	let transferCashflows: CashflowSummary[] = [];
	let transferAccountOptions: AccountOption[] = [];
	let transferEditDrafts: Record<string, TransferEditDraft>;
	let accountEditDrafts: Record<string, AccountEditDraft>;
	let accountInlineError: string;
	let plannerSourceAccountId = '';
	let autoFundingRuleError = '';
	let plannerLiquidityShortcutError = '';
	let plannerHeadline = '';
	let plannerAdvancedOpenStage: 'stage3' | 'stage4' = 'stage3';
	let wasStage3Passed = false;
	let stage3Assessment: Stage3Assessment | null = null;
	let dashboardSections: DashboardSectionsControllerState;
	let dashboardMutations: ReturnType<typeof createDashboardMutationController>;

	$: cashflowFormErrors = $dashboardUiState.cashflowFormErrors;
	$: activeCashflowForm = $dashboardUiState.activeCashflowForm;
	$: cashflowDrafts = $dashboardUiState.cashflowDrafts;
	$: expandedPersonDetailIds = $dashboardUiState.expandedPersonDetailIds;
	$: expandedPropertyDetailIds = $dashboardUiState.expandedPropertyDetailIds;
	$: expandedMortgageDetailIds = $dashboardUiState.expandedMortgageDetailIds;
	$: expandedShareDetailIds = $dashboardUiState.expandedShareDetailIds;
	$: transferFormError = $dashboardUiState.transferFormError;
	$: transferInlineError = $dashboardUiState.transferInlineError;
	$: transferDraft = $dashboardUiState.transferDraft;
	$: transferEditDrafts = $dashboardUiState.transferEditDrafts;
	$: accountEditDrafts = $dashboardUiState.accountEditDrafts;
	$: accountInlineError = $dashboardUiState.accountInlineError;

	const getRetirementAge = (asset: { details?: Record<string, unknown> }) => {
		const details = asset.details ?? {};
		const raw = details.retirementAge;
		const value = typeof raw === 'number' ? raw : Number(raw);
		return Number.isFinite(value) ? value : 0;
	};

	$: plannerFirstShortfall = projectionData.planner?.firstShortfall ?? null;
	$: plannerFirstLiquidityDeficit = projectionData.planner?.firstLiquidityDeficit ?? null;
	$: plannerHeadline = projectionData.planner?.headline ?? '';
	$: plannerStage = projectionData.planner?.stage ?? 'reserves_caps';
	$: stage2FirstRunOutEvent = findStage2RunOutEvent(projectionData.events ?? []);
	$: if (!stage2Passed) {
		plannerAdvancedOpenStage = 'stage3';
	}
	$: plannerLiquiditySaleShortcut = getPlannerLiquiditySaleShortcut({
		firstLiquidityDeficit: plannerFirstLiquidityDeficit,
		plannerFirstShortfall,
		accounts: accountsList,
		assets: assetsList,
		assetAccounts: assetAccountsList,
		liquiditySeries: projectionData.liquidity?.series ?? []
	});
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
	$: stage3Assessment = calculateStage3Assessment({
		stage3Reached,
		projectionData,
		assets: assetsList,
		accounts: accountsList,
		assetAccounts: assetAccountsList,
		accountBalanceTargets
	});
	$: stage1PlannerMessage = plannerStage === 'liquidity' ? plannerHeadline : '';
	$: stage2PlannerMessage = stage2FirstRunOutEvent
		? stage2FirstRunOutEvent.monthLabel
			? `${stage2FirstRunOutEvent.monthLabel}: ${stage2FirstRunOutEvent.message}`
			: stage2FirstRunOutEvent.message
		: 'Auto-funding needs attention.';
	$: stage2AccessibilityShortfall = getStage2AccessibilityShortfall(plannerFirstShortfall);
	$: plannerExistingRules = getPlannerExistingRules(stage2AccessibilityShortfall, autoFundingRules);
	$: plannerSourceOptions = getPlannerSourceOptions(
		stage2AccessibilityShortfall,
		plannerExistingRules
	);
	$: plannerSelectedSourceOption =
		plannerSourceOptions.find((option) => option.id === plannerSourceAccountId) ?? null;
	$: plannerSourceAvailabilityWarning = getPlannerSourceAvailabilityWarning(
		plannerSelectedSourceOption,
		(date) => monthLabelFromDate(date)
	);
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

	const resetScenarioState = () => {
		const resetState = createDashboardScenarioResetState() as any;
		({
			personRetirementAges,
			personDetails,
			cashflowAmounts,
			propertyDetails,
			shareDetails,
			superDetails,
			accountInterestRates,
			propertyErrors,
			shareErrors,
			mortgageDetails,
			mortgageErrors,
			personDetailsErrors,
			updateTimers,
			editingCashflowIds,
			autoFundingRuleError,
			plannerLiquidityShortcutError,
			plannerSourceAccountId,
			plannerAdvancedOpenStage,
			fundingReserveDrafts,
			fundingCapDrafts,
			fundingTabError
		} = resetState);
		dashboardUiState.reset();
		reserveOrderOverridesByTarget = {};
		dashboardWhatIfState.resetData();
		dashboardProjectionState.setProjectionData(EMPTY_PROJECTION);
	};

	$: if (data.scenario.id !== lastScenarioId) {
		resetScenarioState();
		lastScenarioId = data.scenario.id;
		void loadInitialDashboardSections();
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
		const propertyAssets = assetsList.filter((asset) => asset.asset_type === 'property');
		const next: Record<
			string,
			{
				name: string;
				startDate: string;
				propertyUse: import('$lib/dashboard/types').PropertyUse;
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
				const rawPropertyUse = details.propertyUse;
				const propertyUse =
					rawPropertyUse === 'primary_residence' || rawPropertyUse === 'investment_property'
						? rawPropertyUse
						: propertyAssets.length === 1
							? 'primary_residence'
							: 'investment_property';
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
					propertyUse,
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
				capitalGrowthRate: Number.isFinite(capitalGrowthRate)
					? Math.round(capitalGrowthRate * 10) / 10
					: 0,
				dividendYield: Number.isFinite(dividendYield) ? Math.round(dividendYield * 10) / 10 : 0,
				dividendsTakenAsIncomeDate: formatYearMonthInput(details.dividendsTakenAsIncomeDate)
			};
		}
		shareDetails = next;
	}

	$: if (Object.keys(superDetails).length === 0 && (assetsList.length ?? 0) > 0) {
		const next: Record<
			string,
			{ preservationAge: number; capitalGrowthRate: number; managementFeeRate: number }
		> = {};
		for (const asset of assetsList) {
			if (asset.asset_type !== 'superannuation') continue;
			const details = asset.details ?? {};
			const rawPreservationAge = details.preservationAge;
			const rawCapitalGrowthRate = details.capitalGrowthRate;
			const rawManagementFeeRate = details.managementFeeRate;
			const preservationAge =
				typeof rawPreservationAge === 'number'
					? rawPreservationAge
					: Number(rawPreservationAge ?? 0);
			const capitalGrowthRate =
				typeof rawCapitalGrowthRate === 'number'
					? rawCapitalGrowthRate
					: Number(rawCapitalGrowthRate ?? 0);
			const managementFeeRate =
				typeof rawManagementFeeRate === 'number'
					? rawManagementFeeRate
					: Number(rawManagementFeeRate ?? 0);
			next[asset.id] = {
				preservationAge: Number.isFinite(preservationAge)
					? Math.max(0, Math.round(preservationAge))
					: 0,
				capitalGrowthRate: Number.isFinite(capitalGrowthRate) ? roundToTwo(capitalGrowthRate) : 0,
				managementFeeRate: Number.isFinite(managementFeeRate) ? roundToTwo(managementFeeRate) : 0
			};
		}
		superDetails = next;
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
		dashboardUiState.setExpandedPersonDetailIds(next);
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
		dashboardUiState.setTransferDraft({
			...transferDraft,
			startDate:
				toMonthYearInput(projectionData.startDate) ||
				toMonthYearInput(assetsList[0]?.start_date) ||
				toMonthYearInput(accountsList[0]?.start_date) ||
				''
		});
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
			dashboardUiState.setTransferEditDrafts(nextDrafts);
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
			dashboardUiState.setAccountEditDrafts(nextDrafts);
		}
	}

	$: if (
		transferDraft.sourceAccountId &&
		!transferAccountOptions.some((option) => option.id === transferDraft.sourceAccountId)
	) {
		dashboardUiState.setTransferDraft({ ...transferDraft, sourceAccountId: '' });
	}

	$: if (
		transferDraft.destinationAccountId &&
		!transferAccountOptions.some((option) => option.id === transferDraft.destinationAccountId)
	) {
		dashboardUiState.setTransferDraft({ ...transferDraft, destinationAccountId: '' });
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
		return createDefaultCashflowDraft({
			assetType: assetType as 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares',
			type,
			startDate: defaultStartDate,
			assetAccountId: options[0]?.id ?? ''
		});
	};

	const openCashflowForm = (assetId: string, type: 'income' | 'expense') => {
		dashboardUiState.setActiveCashflowForm({ assetId, type });
		const key = getDraftKey(assetId, type);
		if (!cashflowDrafts[key]) {
			const assetType = getAssetType(assetId);
			dashboardUiState.setCashflowDrafts({
				...cashflowDrafts,
				[key]: getDefaultDraft(assetId, type, assetType)
			});
		} else {
			const assetType = getAssetType(assetId);
			const draft = cashflowDrafts[key];
			const coerced = coerceDraftForAssetType(
				assetType as 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares',
				type,
				draft
			);
			if (coerced.category !== draft.category) {
				dashboardUiState.setCashflowDrafts({
					...cashflowDrafts,
					[key]: coerced
				});
			}
		}
	};

	const openCashflowFormForEdit = (assetId: string, cashflow: (typeof cashflows)[number]) => {
		const type = cashflow.cashflow_type as 'income' | 'expense';
		const key = getDraftKey(assetId, type, cashflow.id);
		dashboardUiState.setActiveCashflowForm({ assetId, type, cashflowId: cashflow.id });
		const assetType = getAssetType(assetId);
		const draft = createEditCashflowDraft(cashflow, type, toMonthYearInput);
		const coercedDraft = coerceDraftForAssetType(
			assetType as 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares',
			type,
			draft
		);
		dashboardUiState.setCashflowDrafts({ ...cashflowDrafts, [key]: coercedDraft });
	};

	const closeCashflowForm = () => {
		dashboardUiState.setActiveCashflowForm(null);
	};

	const setCashflowDraft = (key: string, updates: Partial<CashflowDraft>) => {
		dashboardUiState.setCashflowDrafts({
			...cashflowDrafts,
			[key]: { ...cashflowDrafts[key], ...updates }
		});
	};

	const setPropertyDetails = (
		id: string,
		value: {
			name: string;
			startDate: string;
			propertyUse: import('$lib/dashboard/types').PropertyUse;
			marketValue: number;
			marketGrowthRate: number;
			saleDate: string;
			fixedSellingCosts: number;
			variableSellingCosts: number;
		}
	) => {
		propertyDetails = { ...propertyDetails, [id]: value };
	};

	const setSuperDetails = (
		id: string,
		value: {
			preservationAge: number;
			capitalGrowthRate: number;
			managementFeeRate: number;
		}
	) => {
		superDetails = { ...superDetails, [id]: value };
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
		dashboardUiState.setExpandedPropertyDetailIds(next);
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
		dashboardUiState.setExpandedMortgageDetailIds(next);
	};

	const toggleShareDetails = (id: string) => {
		const next = new Set(expandedShareDetailIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		dashboardUiState.setExpandedShareDetailIds(next);
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

	const isValidMonthYear = isValidMonthYearInput;
	const toMonthYearInput = (value: unknown) => formatYearMonthInput(value);

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

	const applyReserveOrderOverrides = (rules: typeof autoFundingRules) => {
		const result = applyReserveOrderOverridesToRules(rules ?? [], reserveOrderOverridesByTarget);
		reserveOrderOverridesByTarget = result.overrides;
		return result.rules;
	};

	const setAutoFundingRules = (rules: typeof autoFundingRules) => {
		dashboardWhatIfState.setAutoFundingRules(applyReserveOrderOverrides(rules ?? []));
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

	const expandAllPnlNodes = () => {
		expandedPnlNodes = new Set(pnlExpandableNodeIds);
	};

	const collapseAllPnlNodes = () => {
		expandedPnlNodes = new Set();
	};

	const loadWhatIfSection = async () => {
		const payload = await fetchDashboardWhatIf(data.scenario.id);
		const nextCashflows = (payload.cashflows as CashflowSummary[]) ?? [];
		dashboardWhatIfState.applyWhatIfPayload({
			assetsList: (payload.assets as AssetItem[]) ?? [],
			accountsList: (payload.accounts as AccountItem[]) ?? [],
			assetAccountsList: (payload.assetAccounts as AssetAccountItem[]) ?? [],
			cashflows: nextCashflows,
			autoFundingRules: payload.autoFundingRules
				? applyReserveOrderOverrides(payload.autoFundingRules as typeof autoFundingRules)
				: undefined,
			accountBalanceTargets: payload.accountBalanceTargets
				? [...(payload.accountBalanceTargets as typeof accountBalanceTargets)]
				: undefined,
			autoSweepRules: payload.autoSweepRules
				? [...(payload.autoSweepRules as typeof autoSweepRules)]
				: undefined
		});
		syncCashflowAmounts(nextCashflows);
		setWhatIfLoadError(null);
	};

	const loadInitialDashboardSections = async () => {
		await runInitialDashboardLoad({
			loadWhatIf: loadWhatIfSection,
			refreshProjection: () => refreshProjection({ force: true }),
			setState: (updater) => dashboardLoadState.apply(updater)
		});
	};

	const refreshProjection = async (options?: { includeCashflows?: boolean; force?: boolean }) => {
		if (!autoRunProjection && !options?.force) {
			return;
		}
		const requestId = ++refreshProjectionRequestId;
		const payload = await fetchDashboardProjection(data.scenario.id, {
			includeCashflows: options?.includeCashflows
		});
		if (requestId !== refreshProjectionRequestId) {
			return;
		}
		const projectionDataPayload = payload.projection as ProjectionData;
		if (payload.autoFundingRules) {
			setAutoFundingRules(payload.autoFundingRules as typeof autoFundingRules);
		}
		if (payload.accountBalanceTargets) {
			dashboardWhatIfState.setAccountBalanceTargets([
				...(payload.accountBalanceTargets as typeof accountBalanceTargets)
			]);
		}
		if (payload.autoSweepRules) {
			dashboardWhatIfState.setAutoSweepRules([
				...(payload.autoSweepRules as typeof autoSweepRules)
			]);
		}
		if (payload.cashflows) {
			const nextCashflows = [...(payload.cashflows as CashflowSummary[])];
			dashboardWhatIfState.setCashflows(nextCashflows);
			syncCashflowAmounts(nextCashflows);
		}
		dashboardProjectionState.applyProjectionPayload({
			projectionData: projectionDataPayload,
			sessionRates: payload.sessionRates,
			projectionRange: payload.projectionRange
		});
		setProjectionError(null);
	};

	const updateProjectionRange = async (range: typeof projectionRange) => {
		await withLock('projectionRange', async () => {
			dashboardProjectionState.setProjectionRange(range);
			const formData = new FormData();
			formData.set('projectionRange', range);
			await fetch('?/updateRange', { method: 'POST', body: formData });
		}).catch((error) => {
			setProjectionError(
				error instanceof Error ? error.message : 'Unable to refresh the projection.'
			);
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
			setProjectionError(
				error instanceof Error ? error.message : 'Unable to refresh the projection.'
			);
		});
	};

	const openLiquidityIncomeShortcut = () => {
		plannerLiquidityShortcutError = '';
		const personAssetId = findFirstPersonAssetId(assetsList);
		if (!personAssetId) {
			plannerLiquidityShortcutError = PLANNER_LIQUIDITY_ERRORS.missingPersonAsset;
			return;
		}
		assetPanelTab = 'assets';
		openCashflowForm(personAssetId, 'income');
		const key = getDraftKey(personAssetId, 'income');
		const existing = cashflowDrafts[key] ?? getDefaultDraft(personAssetId, 'income', 'person');
		setCashflowDraft(
			key,
			buildLiquidityIncomeDraftPatch({
				existing,
				firstLiquidityDeficit: plannerFirstLiquidityDeficit,
				monthLabelFromDate
			})
		);
	};

	const openLiquidityExpenseShortcut = () => {
		plannerLiquidityShortcutError = '';
		const bestShortcut = findBestLiquidityExpenseShortcut(assetsList, cashflowsByAssetId);
		assetPanelTab = 'assets';
		if (bestShortcut) {
			openCashflowFormForEdit(bestShortcut.assetId, bestShortcut.cashflow);
			return;
		}
		plannerLiquidityShortcutError = PLANNER_LIQUIDITY_ERRORS.missingExpenseCashflow;
	};

	const openLiquidityTransferShortcut = () => {
		plannerLiquidityShortcutError = '';
		if (!plannerLiquiditySaleShortcut) {
			plannerLiquidityShortcutError = PLANNER_LIQUIDITY_ERRORS.missingSaleSource;
			return;
		}
		assetPanelTab = 'transfers';
		dashboardUiState.setTransferFormError('');
		dashboardUiState.setTransferInlineError('');
		dashboardUiState.setTransferDraft(
			buildLiquidityTransferDraft(plannerLiquiditySaleShortcut, monthLabelFromDate)
		);
	};

	const openLiquidityPropertySaleShortcut = () => {
		plannerLiquidityShortcutError = '';
		const property = findFirstPropertyAsset(assetsList);
		if (!property) {
			plannerLiquidityShortcutError = PLANNER_LIQUIDITY_ERRORS.missingPropertyAsset;
			return;
		}
		assetPanelTab = 'assets';
		dashboardUiState.setExpandedPropertyDetailIds(
			new Set([...expandedPropertyDetailIds, property.id])
		);
		setPropertyDetails(
			property.id,
			buildLiquidityPropertySaleDetails({
				property,
				existing: propertyDetails[property.id] ?? null,
				firstLiquidityDeficit: plannerFirstLiquidityDeficit,
				monthLabelFromDate,
				formatYearMonthInput
			})
		);
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
		await dashboardMutations.saveAutoFundingRule();
	};
	const removeAutoFundingRule = async (ruleId: string) => {
		await dashboardMutations.removeAutoFundingRule(ruleId);
	};
	const jumpToWhatIfReserves = async () => {
		const firstCashAccountId = fundingCashAccountOptions[0]?.id ?? '';
		await jumpToWhatIfFundingInput({
			tab: 'reserves',
			firstCashAccountId,
			setAssetPanelTab: (tab) => (assetPanelTab = tab),
			tick,
			whatIfPanelElement,
			getElementById: (id) => document.getElementById(id)
		});
	};

	const jumpToWhatIfCaps = async () => {
		const firstCashAccountId = fundingCashAccountOptions[0]?.id ?? '';
		await jumpToWhatIfFundingInput({
			tab: 'caps',
			firstCashAccountId,
			setAssetPanelTab: (tab) => (assetPanelTab = tab),
			tick,
			whatIfPanelElement,
			getElementById: (id) => document.getElementById(id)
		});
	};

	const getFundingTarget = (accountId: string) =>
		accountBalanceTargets.find((item) => item.account_id === accountId && item.enabled) ?? null;

	const upsertFundingTargetForAccount = async (accountId: string) => {
		await dashboardMutations.upsertFundingTargetForAccount(accountId);
	};
	const addReserveRuleForTarget = async (
		targetAccountId: string,
		selectedSourceAccountId: string
	) => {
		await dashboardMutations.addReserveRuleForTarget(targetAccountId, selectedSourceAccountId);
	};
	const removeReserveRule = async (ruleId: string) => {
		await dashboardMutations.removeReserveRule(ruleId);
	};
	const moveReserveRule = async (targetAccountId: string, ruleId: string, direction: -1 | 1) => {
		await dashboardMutations.moveReserveRule(targetAccountId, ruleId, direction);
	};
	const addSweepRuleForSource = async (
		sourceAccountId: string,
		selectedDestinationAccountId: string
	) => {
		await dashboardMutations.addSweepRuleForSource(sourceAccountId, selectedDestinationAccountId);
	};
	const removeSweepRule = async (ruleId: string) => {
		await dashboardMutations.removeSweepRule(ruleId);
	};
	const moveSweepRule = async (sourceAccountId: string, ruleId: string, direction: -1 | 1) => {
		await dashboardMutations.moveSweepRule(sourceAccountId, ruleId, direction);
	};
	const updateRetirementAge = async (assetId: string, retirementAge: number) => {
		await dashboardMutations.updateRetirementAge(assetId, retirementAge);
	};
	const updatePersonDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		dob: string
	) => {
		await dashboardMutations.updatePersonDetails(assetId, name, startDate, dob);
	};
	const updateCashflowAmount = async (cashflowId: string, amount: number) => {
		await dashboardMutations.updateCashflowAmount(cashflowId, amount);
	};
	const createAssetCashflow = async (assetId: string, draft: CashflowDraft) => {
		await dashboardMutations.createAssetCashflow(assetId, draft);
	};
	const updateAssetCashflow = async (assetId: string, cashflowId: string, draft: CashflowDraft) => {
		await dashboardMutations.updateAssetCashflow(assetId, cashflowId, draft);
	};
	const createTransferCashflow = async () => {
		await dashboardMutations.createTransferCashflow();
	};
	const updateTransferInflationAffected = async (
		cashflowId: string,
		inflationAffected: boolean
	) => {
		await dashboardMutations.updateTransferInflationAffected(cashflowId, inflationAffected);
	};
	const setTransferEditDraft = (cashflowId: string, updates: Partial<TransferEditDraft>) => {
		dashboardUiState.setTransferEditDrafts({
			...transferEditDrafts,
			[cashflowId]: { ...transferEditDrafts[cashflowId], ...updates }
		});
	};

	const setTransferDraft = (updates: Partial<TransferDraft>) => {
		dashboardUiState.setTransferDraft({ ...transferDraft, ...updates });
	};

	const handleTransferInflationToggle = (transferId: string, checked: boolean) => {
		dashboardWhatIfState.setCashflows(
			cashflows.map((item) =>
				item.id === transferId ? { ...item, inflation_affected: checked } : item
			)
		);
		updateTransferInflationAffected(transferId, checked);
	};

	const setFundingReserveDraft = (accountId: string, value: string) => {
		fundingReserveDrafts = {
			...fundingReserveDrafts,
			[accountId]: value
		};
	};

	const setFundingCapDraft = (accountId: string, value: string) => {
		fundingCapDrafts = {
			...fundingCapDrafts,
			[accountId]: value
		};
	};

	const saveTransferEditDraft = async (cashflowId: string) => {
		await dashboardMutations.saveTransferEditDraft(cashflowId);
	};
	const setAccountEditDraft = (accountId: string, updates: Partial<AccountEditDraft>) => {
		dashboardUiState.setAccountEditDrafts({
			...accountEditDrafts,
			[accountId]: { ...accountEditDrafts[accountId], ...updates }
		});
	};

	const saveAccountEditDraft = async (accountId: string) => {
		await dashboardMutations.saveAccountEditDraft(accountId);
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
		await dashboardMutations.confirmDeleteCashflow(cashflowId);
	};
	const updatePropertyDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		propertyUse: import('$lib/dashboard/types').PropertyUse,
		marketValue: number,
		marketGrowthRate: number,
		saleDate: string,
		fixedSellingCosts: number,
		variableSellingCosts: number
	) => {
		await dashboardMutations.updatePropertyDetails(
			assetId,
			name,
			startDate,
			propertyUse,
			marketValue,
			marketGrowthRate,
			saleDate,
			fixedSellingCosts,
			variableSellingCosts
		);
	};
	const updateShareDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		capitalGrowthRate: number,
		dividendYield: number,
		dividendsTakenAsIncomeDate: string
	) => {
		await dashboardMutations.updateShareDetails(
			assetId,
			name,
			startDate,
			capitalGrowthRate,
			dividendYield,
			dividendsTakenAsIncomeDate
		);
	};
	const updateAccountInterestRate = async (accountId: string, interestRate: number) => {
		await dashboardMutations.updateAccountInterestRate(accountId, interestRate);
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
		await dashboardMutations.updateMortgageDetails(
			assetId,
			name,
			startDate,
			termYears,
			termMonths,
			mortgageAccountName,
			openingBalance
		);
	};
	const updateSuperannuationDetails = async (
		assetId: string,
		preservationAge: number,
		capitalGrowthRate: number,
		managementFeeRate: number
	) => {
		await dashboardMutations.updateSuperannuationDetails(
			assetId,
			preservationAge,
			capitalGrowthRate,
			managementFeeRate
		);
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
			setProjectionError(
				error instanceof Error ? error.message : 'Unable to refresh the projection.'
			);
		});
	};

	const queueInflationRateChange = (delta: number) => {
		const current = Number.isFinite(sessionRates.inflationRate) ? sessionRates.inflationRate : 2;
		const next = Math.round((current + delta) * 10) / 10;
		dashboardProjectionState.setSessionRates({ ...sessionRates, inflationRate: next });
		scheduleUpdate('updateInflationRate', () => {
			persistSessionRates();
		});
	};

	$: projectionDerived = buildDashboardProjectionDerived({
		projectionData,
		accountsList,
		projectionBalanceSource,
		projectionRange,
		transactionSortKey,
		transactionSortDirection,
		expandedPnlNodes,
		formatLabel
	});
	$: chartProjection = projectionDerived.chartProjection;
	$: totalSeries = projectionDerived.totalSeries;
	$: balanceExtent = projectionDerived.balanceExtent;
	$: chartAxisPoints = projectionDerived.chartAxisPoints;
	$: balanceSheetHeaders = projectionDerived.balanceSheetHeaders;
	$: balanceSheetRows = projectionDerived.balanceSheetRows;
	$: transactionPivot = projectionDerived.transactionPivot;
	$: profitLossRows = projectionDerived.profitLossRows;
	$: pnlExpandableNodeIds = projectionDerived.pnlExpandableNodeIds;
	$: isAllPnlExpanded = projectionDerived.isAllPnlExpanded;

	const toggleTransactionSort = (key: TransactionSortKey) => {
		if (transactionSortKey === key) {
			transactionSortDirection = transactionSortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}
		transactionSortKey = key;
		transactionSortDirection = 'asc';
	};

	const formatAxisCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0
		}).format(value);

	let chart: Chart | null = null;
	let chartCanvas: HTMLCanvasElement | null = null;
	const buildChartData = () => {
		const labels = chartAxisPoints.map((point: any) => point.monthLabel);
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
				data: series.points.map((point: any) => point.balance),
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
					font: { size: 9 },
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

	$: dashboardMutations = createDashboardMutationController({
		scenarioId: data.scenario.id,
		getAutoRunProjection: () => autoRunProjection,
		withLock,
		refreshProjection,
		refreshWhatIf: loadWhatIfSection,
		setProjectionError,
		getStage2AccessibilityShortfall: () => stage2AccessibilityShortfall,
		getPlannerSourceAccountId: () => plannerSourceAccountId,
		setPlannerSourceAccountId: (value) => {
			plannerSourceAccountId = value;
		},
		setAutoFundingRuleError: (value) => {
			autoFundingRuleError = value;
		},
		setFundingTabError: (value) => {
			fundingTabError = value;
		},
		getAutoFundingRules: () => (autoFundingRules ?? []) as Array<Record<string, unknown>>,
		setAutoFundingRules: (rules) => {
			setAutoFundingRules(rules as typeof autoFundingRules);
		},
		getAutoSweepRules: () => (autoSweepRules ?? []) as Array<Record<string, unknown>>,
		setAutoSweepRules: (rules) => {
			dashboardWhatIfState.setAutoSweepRules(rules as typeof autoSweepRules);
		},
		setAccountBalanceTargets: (targets) => {
			dashboardWhatIfState.setAccountBalanceTargets(targets as typeof accountBalanceTargets);
		},
		getFundingReserveDraft: (accountId) => fundingReserveDrafts[accountId] ?? '0',
		getFundingCapDraft: (accountId) => fundingCapDrafts[accountId] ?? '',
		setReserveOrderOverride: (targetAccountId, orderedRuleIds) => {
			reserveOrderOverridesByTarget = {
				...reserveOrderOverridesByTarget,
				[targetAccountId]: orderedRuleIds
			};
		},
		syncCashflowAmounts,
		setCashflows: (cashflows) => {
			dashboardWhatIfState.setCashflows([...cashflows]);
		},
		getTransferDraft: () => transferDraft,
		setTransferDraft: (draft) => {
			dashboardUiState.setTransferDraft(draft);
		},
		setTransferFormError: (message) => {
			dashboardUiState.setTransferFormError(message);
		},
		setTransferInlineError: (message) => {
			dashboardUiState.setTransferInlineError(message);
		},
		getTransferEditDraft: (cashflowId) => transferEditDrafts[cashflowId],
		setTransferEditDraft: (cashflowId, updates) => {
			setTransferEditDraft(cashflowId, updates);
		},
		getCashflowDrafts: () => cashflowDrafts,
		setCashflowDrafts: (drafts) => {
			dashboardUiState.setCashflowDrafts(drafts);
		},
		getCashflowFormErrors: () => cashflowFormErrors,
		setCashflowFormErrors: (errors) => {
			dashboardUiState.setCashflowFormErrors(errors);
		},
		setActiveCashflowForm: (form) => {
			dashboardUiState.setActiveCashflowForm(form);
		},
		getAssetType: (assetId) => getAssetType(assetId),
		getDefaultDraft: (assetId, type, assetType) => getDefaultDraft(assetId, type, assetType),
		getDraftKey: (assetId, type) => getDraftKey(assetId, type),
		isValidMonthYear: (value) =>
			typeof value === 'string' ? isValidMonthYear(value) : isValidMonthYear(String(value ?? '')),
		toMonthYearInput,
		getAccountEditDraft: (accountId) => accountEditDrafts[accountId],
		setAccountEditDraft: (accountId, updates) => {
			setAccountEditDraft(accountId, updates);
		},
		getAccountsList: () => accountsList as Array<Record<string, unknown>>,
		setAccountsList: (accounts) => {
			dashboardWhatIfState.setAccountsList(accounts as typeof accountsList);
		},
		setAccountInlineError: (message) => {
			dashboardUiState.setAccountInlineError(message);
		},
		normalizeYearMonthValue,
		roundToTwo
	});

	$: dashboardSections = createDashboardSectionsController({
		projectionPanelProps: {
			scenarioName: data.scenario.name,
			projectionStartDate: projectionData.startDate,
			formatYearMonthInput,
			projectionRange,
			isUpdating,
			runProjectionNow,
			updateProjectionRange,
			sessionInflationRate: sessionRates.inflationRate,
			formatRate,
			queueInflationRateChange,
			projectionError: $dashboardLoadState.projectionError,
			chartProjection,
			balanceSheetHeaders,
			balanceSheetRows,
			profitLossRows,
			isAllPnlExpanded,
			expandAllPnlNodes,
			collapseAllPnlNodes,
			expandedPnlNodes,
			togglePnlNode,
			formatWholeCurrency,
			transactionSortKey,
			transactionSortDirection,
			toggleTransactionSort,
			transactionPivot,
			isInitialProjectionLoading: $dashboardLoadState.isInitialProjectionLoading
		},
		whatIfPanelProps: {
			isInitialWhatIfLoading: $dashboardLoadState.isInitialWhatIfLoading,
			whatIfLoadError: $dashboardLoadState.whatIfLoadError,
			assetsTabProps: {
				data: { assetsList, assetAccountsList, accountsList },
				person: {
					personDetails,
					personRetirementAges,
					setPersonRetirementAge,
					updateRetirementAge,
					expandedPersonDetailIds,
					togglePersonDetails,
					personDetailsErrors,
					isValidMonthYear,
					setPersonDetails,
					setPersonDetailsError,
					updatePersonDetails
				},
				cashflow: {
					cashflowsByAssetId,
					cashflowAmounts,
					editingCashflowIds,
					setCashflowAmount,
					updateCashflowAmount,
					openCashflowFormForEdit,
					requestDeleteCashflow,
					openCashflowForm,
					activeCashflowForm,
					getDraftKey,
					cashflowDrafts,
					getCategoryOptionsFor,
					cashflowFrequencyOptions,
					getAssetAccountOptions,
					cashflowFormErrors,
					setCashflowDraft,
					closeCashflowForm,
					updateAssetCashflow,
					createAssetCashflow
				},
				share: {
					shareDetails,
					shareErrors,
					expandedShareDetailIds,
					toggleShareDetails,
					setShareDetails,
					setShareError,
					updateShareDetails
				},
				super: {
					superDetails,
					setSuperDetails,
					updateSuperannuationDetails
				},
				property: {
					propertyDetails,
					propertyErrors,
					expandedPropertyDetailIds,
					togglePropertyDetails,
					setPropertyDetails,
					setPropertyError,
					updatePropertyDetails
				},
				mortgage: {
					mortgageDetails,
					mortgageErrors,
					expandedMortgageDetailIds,
					toggleMortgageDetails,
					setMortgageDetails,
					setMortgageError,
					updateMortgageDetails,
					validateMortgageDetails
				},
				ui: {
					stepForValue,
					scheduleUpdate,
					formatLabel,
					toMonthYearInput,
					roundToTwo,
					formatRate,
					formatYearMonthInput
				}
			},
			accountsTabProps: {
				data: { accountsList, accountEditDrafts, accountInterestRates, accountInlineError },
				actions: {
					setAccountEditDraft,
					saveAccountEditDraft,
					setAccountInterestRate,
					adjustAccountInterestRate,
					updateAccountInterestRate
				},
				ui: { toMonthYearInput, scheduleUpdate, formatRate, roundToTwo, formatLabel }
			},
			transfersTabProps: {
				data: {
					transferCashflows,
					transferEditDrafts,
					transferAccountOptions,
					transferInlineError,
					transferFormError,
					transferDraft
				},
				handlers: {
					onTransferDraftChange: setTransferDraft,
					setTransferEditDraft,
					saveTransferEditDraft,
					onTransferInflationToggle: handleTransferInflationToggle,
					requestDeleteCashflow,
					createTransferCashflow
				},
				ui: { formatLabel, cashflowFrequencyOptions, toMonthYearInput, scheduleUpdate }
			},
			reservesTabProps: {
				data: {
					fundingCashAccountOptions,
					fundingReserveDrafts,
					fundingReservePriorityRowCount,
					fundingReserveRulesByAccount,
					fundingReserveSourceOptionsByAccount,
					transferAccountOptions,
					fundingTabError
				},
				actions: {
					setFundingReserveDraft,
					upsertFundingTargetForAccount,
					moveReserveRule,
					removeReserveRule,
					addReserveRuleForTarget
				},
				ui: { scheduleUpdate }
			},
			capsTabProps: {
				data: {
					fundingCashAccountOptions,
					fundingCapDrafts,
					fundingCapPriorityRowCount,
					fundingSweepRulesByAccount,
					fundingSweepDestinationOptionsByAccount,
					transferAccountOptions,
					fundingTabError
				},
				actions: {
					setFundingCapDraft,
					upsertFundingTargetForAccount,
					moveSweepRule,
					removeSweepRule,
					addSweepRuleForSource
				},
				ui: { scheduleUpdate }
			}
		},
		plannerPanelProps: {
			stage1Passed,
			plannerStage,
			stage1PlannerMessage,
			assetsList,
			jumpToWhatIfAssetsExpense,
			stage2Reached,
			stage2Passed,
			stage2PlannerMessage,
			stage2AccessibilityShortfall,
			plannerExistingRules,
			accountsList,
			removeAutoFundingRule,
			plannerSourceOptions,
			plannerSourceAvailabilityWarning,
			saveAutoFundingRule,
			autoFundingRuleError,
			stage3Reached,
			stage3Passed,
			stage3Assessment,
			stage4Reached,
			stage4Passed,
			jumpToWhatIfReserves,
			jumpToWhatIfCaps,
			monthLabelFromDate,
			projectionEvents: projectionData.events ?? [],
			isInitialProjectionLoading: $dashboardLoadState.isInitialProjectionLoading
		}
	});

	onMount(() => {
		void loadInitialDashboardSections();
	});

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

<section class="dashboard-shell not-prose -mt-8">
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
		<div class="space-y-4">
			<ProjectionPanel
				{...dashboardSections.projectionPanelProps}
				bind:projectionView
				bind:projectionBalanceSource
				bind:autoRunProjection
				bind:chartCanvas
			/>
			<WhatIfPanel
				{...dashboardSections.whatIfPanelProps}
				bind:whatIfPanelElement
				bind:assetPanelTab
			/>
		</div>
		<PlannerPanel
			{...dashboardSections.plannerPanelProps}
			bind:plannerSourceAccountId
			bind:plannerAdvancedOpenStage
		/>
	</div>
</section>

<ConfirmDialog
	open={Boolean(deleteConfirmId)}
	title="Delete cashflow?"
	message="This cashflow will be permanently removed from the scenario."
	confirmLabel="Delete"
	cancelLabel="Cancel"
	onCancel={cancelDeleteCashflow}
	onConfirm={confirmDeleteCashflow}
/>

<style>
	.dashboard-shell :global(input:not([type='checkbox']):not([type='radio']):not([type='range'])),
	.dashboard-shell :global(select),
	.dashboard-shell :global(textarea) {
		font-size: 0.75rem;
		line-height: 1rem;
	}
</style>

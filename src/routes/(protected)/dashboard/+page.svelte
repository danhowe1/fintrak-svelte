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
	import { postAction } from '$lib/dashboard/action-client';
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
	import {
		createAssetCashflowCommand,
		createTransferCashflowCommand,
		deleteCashflowCommand,
		saveTransferEditDraftCommand,
		updateAssetCashflowCommand,
		updateCashflowAmountCommand,
		updateTransferInflationAffectedCommand
	} from '$lib/dashboard/cashflow-commands';
	import {
		applyReserveOrderOverrides as applyReserveOrderOverridesToRules
	} from '$lib/dashboard/funding-order';
	import {
		addReserveRuleForTargetCommand,
		addSweepRuleForSourceCommand,
		moveReserveRuleCommand,
		moveSweepRuleCommand,
		removeReserveRuleCommand,
		removeSweepRuleCommand,
		upsertFundingTargetForAccountCommand
	} from '$lib/dashboard/funding-commands';
	import {
		runScenarioMutationCommand,
		saveAccountEditDraftCommand
	} from '$lib/dashboard/entity-commands';
	import {
		calculateStage3Assessment,
		findStage2RunOutEvent,
		getPlannerExistingRules,
		getPlannerLiquiditySaleShortcut,
		getPlannerSourceAvailabilityWarning,
		getPlannerSourceOptions,
		getStage2AllocationShortfall
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
	import {
		jumpToWhatIfFundingInput,
		removeAutoFundingRuleCommand,
		saveAutoFundingRuleCommand
	} from '$lib/dashboard/planner-commands';
	import type {
		AccountEditDraft,
		AccountOption,
		AssetPanelTab,
		ChartSeries,
		CashflowDraft,
		CashflowSummary,
		PnlNode,
		ProjectionBalanceSource,
		ProjectionRange,
		ProjectionView,
		Stage3Assessment,
		TransferDraft,
		TransferEditDraft,
		TransactionSortDirection,
		TransactionSortKey
	} from '$lib/dashboard/types';
	import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
	import DisclosureToggle from '$lib/components/ui/DisclosureToggle.svelte';
	import CashflowDraftForm from '$lib/components/dashboard/CashflowDraftForm.svelte';
	import AssetsTab from '$lib/components/dashboard/tabs/AssetsTab.svelte';
	import AccountsTab from '$lib/components/dashboard/tabs/AccountsTab.svelte';
	import TransfersTab from '$lib/components/dashboard/tabs/TransfersTab.svelte';
	import ReservesTab from '$lib/components/dashboard/tabs/ReservesTab.svelte';
	import CapsTab from '$lib/components/dashboard/tabs/CapsTab.svelte';

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

	let projectionView: ProjectionView = 'balances';
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
	let cashflowsByAssetId: Record<string, CashflowSummary[]> = {};
	let editingCashflowIds = new Set<string>();
	let expandedPersonDetailIds = new Set<string>();
	let expandedPropertyDetailIds = new Set<string>();
	let expandedMortgageDetailIds = new Set<string>();
	let expandedShareDetailIds = new Set<string>();
	let deleteConfirmId: string | null = null;
	let transferFormError = '';
	let transferInlineError = '';
	let transferDraft: TransferDraft = {
		sourceAccountId: '',
		destinationAccountId: '',
		amount: '',
		frequency: 'monthly',
		startDate: '',
		endDate: '',
		description: '',
		inflationAffected: false
	};
	let transferCashflows: CashflowSummary[] = [];
	let transferAccountOptions: AccountOption[] = [];
	let transferEditDrafts: Record<string, TransferEditDraft> = {};
	let accountEditDrafts: Record<string, AccountEditDraft> = {};
let accountInlineError = '';
let plannerSourceAccountId = '';
let autoFundingRuleError = '';
let plannerLiquidityShortcutError = '';
let plannerAdvancedOpenStage: 'stage3' | 'stage4' = 'stage3';
let wasStage3Passed = false;
	let stage3Assessment: Stage3Assessment | null = null;

	const getRetirementAge = (asset: { details?: Record<string, unknown> }) => {
		const details = asset.details ?? {};
		const raw = details.retirementAge;
		const value = typeof raw === 'number' ? raw : Number(raw);
		return Number.isFinite(value) ? value : 0;
	};

	$: plannerFirstShortfall = projectionData.planner?.firstShortfall ?? null;
	$: plannerFirstLiquidityDeficit = projectionData.planner?.firstLiquidityDeficit ?? null;
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
		accounts: accountsList,
		assetAccounts: assetAccountsList,
		accountBalanceTargets
	});
	$: stage1PlannerMessage = plannerFirstLiquidityDeficit
		? `${plannerFirstLiquidityDeficit.monthLabel}: Liquidity falls below $0 by ${formatWholeCurrency(plannerFirstLiquidityDeficit.deficitAmount)}.`
		: '';
	$: stage2PlannerMessage = stage2FirstRunOutEvent
		? stage2FirstRunOutEvent.monthLabel
			? `${stage2FirstRunOutEvent.monthLabel}: ${stage2FirstRunOutEvent.message}`
			: stage2FirstRunOutEvent.message
		: 'Auto-funding needs attention.';
	$: stage2AllocationShortfall = getStage2AllocationShortfall(plannerFirstShortfall);
	$: plannerExistingRules = getPlannerExistingRules(stage2AllocationShortfall, autoFundingRules);
	$: plannerSourceOptions = getPlannerSourceOptions(stage2AllocationShortfall, plannerExistingRules);
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
		return createDefaultCashflowDraft({
			assetType: assetType as 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares',
			type,
			startDate: defaultStartDate,
			assetAccountId: options[0]?.id ?? ''
		});
	};

	const openCashflowForm = (assetId: string, type: 'income' | 'expense') => {
		activeCashflowForm = { assetId, type };
		const key = getDraftKey(assetId, type);
		if (!cashflowDrafts[key]) {
			const assetType = getAssetType(assetId);
			cashflowDrafts = { ...cashflowDrafts, [key]: getDefaultDraft(assetId, type, assetType) };
		} else {
			const assetType = getAssetType(assetId);
			const draft = cashflowDrafts[key];
			const coerced = coerceDraftForAssetType(
				assetType as 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares',
				type,
				draft
			);
			if (coerced.category !== draft.category) {
				cashflowDrafts = {
					...cashflowDrafts,
					[key]: coerced
				};
			}
		}
	};

	const openCashflowFormForEdit = (assetId: string, cashflow: (typeof cashflows)[number]) => {
		const type = cashflow.cashflow_type as 'income' | 'expense';
		const key = getDraftKey(assetId, type, cashflow.id);
		activeCashflowForm = { assetId, type, cashflowId: cashflow.id };
		const assetType = getAssetType(assetId);
		const draft = createEditCashflowDraft(cashflow, type, toMonthYearInput);
		const coercedDraft = coerceDraftForAssetType(
			assetType as 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares',
			type,
			draft
		);
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

	const expandAllPnlNodes = () => {
		expandedPnlNodes = new Set(pnlExpandableNodeIds);
	};

	const collapseAllPnlNodes = () => {
		expandedPnlNodes = new Set();
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
		transferFormError = '';
		transferInlineError = '';
		transferDraft = buildLiquidityTransferDraft(plannerLiquiditySaleShortcut, monthLabelFromDate);
	};

	const openLiquidityPropertySaleShortcut = () => {
		plannerLiquidityShortcutError = '';
		const property = findFirstPropertyAsset(assetsList);
		if (!property) {
			plannerLiquidityShortcutError = PLANNER_LIQUIDITY_ERRORS.missingPropertyAsset;
			return;
		}
		assetPanelTab = 'assets';
		expandedPropertyDetailIds = new Set([...expandedPropertyDetailIds, property.id]);
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
		const result = await saveAutoFundingRuleCommand({
			stage2AllocationShortfall,
			plannerSourceAccountId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			postAction,
			setAutoFundingRules,
			refreshProjection
		});
		autoFundingRuleError = result.autoFundingRuleError;
		if (result.nextPlannerSourceAccountId !== undefined) {
			plannerSourceAccountId = result.nextPlannerSourceAccountId;
		}
		projectionError = result.projectionError;
	};

	const removeAutoFundingRule = async (ruleId: string) => {
		const result = await removeAutoFundingRuleCommand({
			ruleId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			postAction,
			setAutoFundingRules,
			refreshProjection
		});
		autoFundingRuleError = result.autoFundingRuleError;
		projectionError = result.projectionError;
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
		fundingTabError = await upsertFundingTargetForAccountCommand({
			accountId,
			minDraft: fundingReserveDrafts[accountId] ?? '0',
			maxDraft: fundingCapDrafts[accountId] ?? '',
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			postAction,
			setAccountBalanceTargets: (targets: typeof accountBalanceTargets) => {
				accountBalanceTargets = [...targets];
			},
			refreshProjection
		});
	};

	const addReserveRuleForTarget = async (targetAccountId: string, selectedSourceAccountId: string) => {
		fundingTabError = await addReserveRuleForTargetCommand({
			targetAccountId,
			selectedSourceAccountId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			autoFundingRules,
			withLock,
			postAction,
			setAutoFundingRules,
			refreshProjection
		});
	};

	const removeReserveRule = async (ruleId: string) => {
		fundingTabError = await removeReserveRuleCommand({
			ruleId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			autoFundingRules,
			withLock,
			postAction,
			setAutoFundingRules,
			refreshProjection
		});
	};

	const moveReserveRule = async (targetAccountId: string, ruleId: string, direction: -1 | 1) => {
		fundingTabError = await moveReserveRuleCommand({
			targetAccountId,
			ruleId,
			direction,
			scenarioId: data.scenario.id,
			autoRunProjection,
			autoFundingRules,
			withLock,
			postAction,
			setAutoFundingRules,
			refreshProjection,
			setReserveOrderOverride: (overrideTargetAccountId, orderedRuleIds) => {
				reserveOrderOverridesByTarget = {
					...reserveOrderOverridesByTarget,
					[overrideTargetAccountId]: orderedRuleIds
				};
			}
		});
	};

	const addSweepRuleForSource = async (
		sourceAccountId: string,
		selectedDestinationAccountId: string
	) => {
		fundingTabError = await addSweepRuleForSourceCommand({
			sourceAccountId,
			selectedDestinationAccountId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			autoSweepRules,
			withLock,
			postAction,
			setAutoSweepRules: (rules) => {
				autoSweepRules = [...rules];
			},
			refreshProjection
		});
	};

	const removeSweepRule = async (ruleId: string) => {
		fundingTabError = await removeSweepRuleCommand({
			ruleId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			autoSweepRules,
			withLock,
			postAction,
			setAutoSweepRules: (rules) => {
				autoSweepRules = [...rules];
			},
			refreshProjection
		});
	};

	const moveSweepRule = async (sourceAccountId: string, ruleId: string, direction: -1 | 1) => {
		fundingTabError = await moveSweepRuleCommand({
			sourceAccountId,
			ruleId,
			direction,
			scenarioId: data.scenario.id,
			autoRunProjection,
			autoSweepRules,
			withLock,
			postAction,
			setAutoSweepRules: (rules) => {
				autoSweepRules = [...rules];
			},
			refreshProjection
		});
	};

	const updateRetirementAge = async (assetId: string, retirementAge: number) => {
		const error = await runScenarioMutationCommand({
			lockKey: `retirement:${assetId}`,
			action: 'updateRetirementAge',
			scenarioId: data.scenario.id,
			fields: {
				assetId,
				retirementAge: String(retirementAge)
			},
			errorMessage: 'Unable to update retirement age. Please try again.',
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
	};

	const updatePersonDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		dob: string
	) => {
		const error = await runScenarioMutationCommand({
			lockKey: `person-details:${assetId}`,
			action: 'updatePersonDetails',
			scenarioId: data.scenario.id,
			fields: {
				assetId,
				name,
				startDate,
				dob
			},
			errorMessage: 'Unable to update person details. Please try again.',
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
	};

	const updateCashflowAmount = async (cashflowId: string, amount: number) => {
		const error = await updateCashflowAmountCommand({
			cashflowId,
			amount,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
	};

	const createAssetCashflow = async (assetId: string, draft: CashflowDraft) => {
		const error = await createAssetCashflowCommand({
			assetId,
			draft,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection,
			syncCashflowAmounts,
			setCashflows: (nextCashflows) => {
				cashflows = [...nextCashflows];
			},
			resetDraft: () => {
				const draftKey = getDraftKey(assetId, draft.type);
				const assetType = getAssetType(assetId);
				cashflowDrafts = {
					...cashflowDrafts,
					[draftKey]: getDefaultDraft(assetId, draft.type, assetType)
				};
			},
			clearForm: () => {
				activeCashflowForm = null;
			},
			setFormError: (message) => {
				cashflowFormErrors = { ...cashflowFormErrors, [assetId]: message };
			}
		});
		if (error) projectionError = error;
	};

	const updateAssetCashflow = async (assetId: string, cashflowId: string, draft: CashflowDraft) => {
		const error = await updateAssetCashflowCommand({
			assetId,
			cashflowId,
			draft,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection,
			syncCashflowAmounts,
			setCashflows: (nextCashflows) => {
				cashflows = [...nextCashflows];
			},
			clearForm: () => {
				activeCashflowForm = null;
			},
			setFormError: (message) => {
				cashflowFormErrors = { ...cashflowFormErrors, [assetId]: message };
			}
		});
		if (error) projectionError = error;
	};

	const createTransferCashflow = async () => {
		const error = await createTransferCashflowCommand({
			draft: transferDraft,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection,
			isValidMonthYear,
			setCashflows: (nextCashflows) => {
				cashflows = [...nextCashflows];
			},
			syncCashflowAmounts,
			setTransferDraft: (nextDraft) => {
				transferDraft = nextDraft;
			},
			setTransferFormError: (message) => {
				transferFormError = message;
			}
		});
		if (error) projectionError = error;
	};

	const updateTransferInflationAffected = async (
		cashflowId: string,
		inflationAffected: boolean
	) => {
		const error = await updateTransferInflationAffectedCommand({
			cashflowId,
			inflationAffected,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection,
			setCashflows: (nextCashflows) => {
				cashflows = [...nextCashflows];
			},
			syncCashflowAmounts
		});
		if (error) projectionError = error;
	};

	const setTransferEditDraft = (cashflowId: string, updates: Partial<TransferEditDraft>) => {
		transferEditDrafts = {
			...transferEditDrafts,
			[cashflowId]: { ...transferEditDrafts[cashflowId], ...updates }
		};
	};

	const setTransferDraft = (updates: Partial<TransferDraft>) => {
		transferDraft = { ...transferDraft, ...updates };
	};

	const handleTransferInflationToggle = (transferId: string, checked: boolean) => {
		cashflows = cashflows.map((item) =>
			item.id === transferId ? { ...item, inflation_affected: checked } : item
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
		const error = await saveTransferEditDraftCommand({
			cashflowId,
			draft: transferEditDrafts[cashflowId],
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection,
			isValidMonthYear,
			toMonthYearInput,
			setCashflows: (nextCashflows) => {
				cashflows = [...nextCashflows];
			},
			syncCashflowAmounts,
			setTransferEditDraft,
			setTransferInlineError: (message) => {
				transferInlineError = message;
			}
		});
		if (error) projectionError = error;
	};

	const setAccountEditDraft = (accountId: string, updates: Partial<AccountEditDraft>) => {
		accountEditDrafts = {
			...accountEditDrafts,
			[accountId]: { ...accountEditDrafts[accountId], ...updates }
		};
	};

	const saveAccountEditDraft = async (accountId: string) => {
		const result = await saveAccountEditDraftCommand({
			accountId,
			draft: accountEditDrafts[accountId],
			scenarioId: data.scenario.id,
			accounts: accountsList,
			autoRunProjection,
			withLock,
			isValidMonthYear,
			normalizeYearMonthValue,
			roundToTwo,
			toMonthYearInput,
			refreshProjection
		});
		if (!result.ok) {
			accountInlineError = result.error;
			projectionError = result.error;
			return;
		}
		accountsList = result.accounts;
		setAccountEditDraft(accountId, result.nextDraft);
		accountInlineError = '';
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
		const error = await deleteCashflowCommand({
			cashflowId,
			scenarioId: data.scenario.id,
			autoRunProjection,
			withLock,
			refreshProjection,
			setCashflows: (nextCashflows) => {
				cashflows = [...nextCashflows];
			},
			syncCashflowAmounts
		});
		if (error) projectionError = error;
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
		const error = await runScenarioMutationCommand({
			lockKey: `property:${assetId}`,
			action: 'updatePropertyDetails',
			scenarioId: data.scenario.id,
			fields: {
				assetId: assetId,
				name,
				startDate,
				marketValue: String(marketValue),
				marketGrowthRate: String(marketGrowthRate),
				saleDate,
				fixedSellingCosts: String(fixedSellingCosts),
				variableSellingCosts: String(variableSellingCosts)
			},
			errorMessage: 'Unable to update property details. Please try again.',
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
	};

	const updateShareDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		capitalGrowthRate: number,
		dividendYield: number,
		dividendsTakenAsIncomeDate: string
	) => {
		const error = await runScenarioMutationCommand({
			lockKey: `shares:${assetId}`,
			action: 'updateShareDetails',
			scenarioId: data.scenario.id,
			fields: {
				assetId: assetId,
				name,
				startDate,
				capitalGrowthRate: String(capitalGrowthRate),
				dividendYield: String(dividendYield),
				dividendsTakenAsIncomeDate
			},
			errorMessage: 'Unable to update shares details. Please try again.',
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
	};

	const updateAccountInterestRate = async (accountId: string, interestRate: number) => {
		const error = await runScenarioMutationCommand({
			lockKey: `account:${accountId}`,
			action: 'updateAccountInterestRate',
			scenarioId: data.scenario.id,
			fields: {
				accountId,
				interestRate: String(interestRate)
			},
			errorMessage: 'Unable to update account interest rate. Please try again.',
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
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
		const error = await runScenarioMutationCommand({
			lockKey: `mortgage:${assetId}`,
			action: 'updateMortgageDetails',
			scenarioId: data.scenario.id,
			fields: {
				assetId: assetId,
				name,
				startDate,
				termYears: String(termYears),
				termMonths: String(termMonths),
				mortgageAccountName,
				openingBalance: String(openingBalance)
			},
			errorMessage: 'Unable to update mortgage details. Please try again.',
			autoRunProjection,
			withLock,
			refreshProjection
		});
		if (error) projectionError = error;
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

	$: transactionPivot = (() => {
		const transactions = chartProjection.transactions ?? [];
		const isAnnualRange = projectionRange === '10y' || projectionRange === 'all';
		if (transactions.length === 0) {
			return {
				headers: [] as string[],
				totalValues: [] as number[],
				rows: [] as {
					assetName: string;
					accountName: string;
					type: string;
					category: string;
					description: string;
					values: number[];
				}[]
			};
		}

		const headerLabels = (() => {
			if (isAnnualRange) {
				const years = new Set<number>();
				for (const transaction of transactions) {
					const parsed = fromYearMonthInt(transaction.date);
					if (!parsed) continue;
					years.add(parsed.year);
				}
				return Array.from(years)
					.sort((a, b) => a - b)
					.map((year) => String(year));
			}
			const labelsByDate = new Map<number, string>();
			for (const transaction of transactions) {
				if (!labelsByDate.has(transaction.date)) {
					labelsByDate.set(transaction.date, transaction.monthLabel);
				}
			}
			return Array.from(labelsByDate.entries())
				.sort((a, b) => a[0] - b[0])
				.map((entry) => entry[1]);
		})();

		const headerIndexByLabel = new Map<string, number>();
		headerLabels.forEach((label, index) => headerIndexByLabel.set(label, index));
		const rowMap = new Map<
			string,
			{
				assetName: string;
				accountName: string;
				type: string;
				category: string;
				description: string;
				values: number[];
			}
		>();

		for (const transaction of transactions) {
			const label = isAnnualRange
				? String(fromYearMonthInt(transaction.date)?.year ?? '')
				: transaction.monthLabel;
			const headerIndex = headerIndexByLabel.get(label);
			if (headerIndex === undefined) continue;

			const assetName = transaction.assetName ?? '';
			const accountName = transaction.accountName ?? '';
			const type = formatLabel(transaction.cashflowType);
			const category = formatLabel(transaction.category);
			const description = (transaction.description ?? '').trim();
			const rowKey = [assetName, accountName, type, category, description].join('|');
			const row =
				rowMap.get(rowKey) ??
				{
					assetName,
					accountName,
					type,
					category,
					description,
					values: Array(headerLabels.length).fill(0)
				};
			row.values[headerIndex] += transaction.amount;
			rowMap.set(rowKey, row);
		}

		const rows = Array.from(rowMap.values()).sort((a, b) => {
			const primaryDiff = (a[transactionSortKey] ?? '').localeCompare(b[transactionSortKey] ?? '');
			if (primaryDiff !== 0) return transactionSortDirection === 'asc' ? primaryDiff : -primaryDiff;
			const assetDiff = a.assetName.localeCompare(b.assetName);
			if (assetDiff !== 0) return assetDiff;
			const accountDiff = a.accountName.localeCompare(b.accountName);
			if (accountDiff !== 0) return accountDiff;
			const typeDiff = a.type.localeCompare(b.type);
			if (typeDiff !== 0) return typeDiff;
			const categoryDiff = a.category.localeCompare(b.category);
			if (categoryDiff !== 0) return categoryDiff;
			return a.description.localeCompare(b.description);
		});
		const totalValues = Array(headerLabels.length).fill(0);
		for (const row of rows) {
			row.values.forEach((value, idx) => {
				totalValues[idx] += value;
			});
		}

		return {
			headers: headerLabels,
			totalValues,
			rows
		};
	})();

	const toggleTransactionSort = (key: TransactionSortKey) => {
		if (transactionSortKey === key) {
			transactionSortDirection = transactionSortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}
		transactionSortKey = key;
		transactionSortDirection = 'asc';
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
				id: 'net',
				label: 'Net',
				level: 0,
				values: netTotals
			},
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
	$: pnlExpandableNodeIds = (() => {
		const ids: string[] = [];
		const walk = (nodes: PnlNode[]) => {
			for (const node of nodes) {
				if (!node.children?.length) continue;
				ids.push(node.id);
				walk(node.children);
			}
		};
		walk(profitLossTree);
		return ids;
	})();
	$: isAllPnlExpanded =
		pnlExpandableNodeIds.length > 0 &&
		pnlExpandableNodeIds.every((id) => expandedPnlNodes.has(id));

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
						<div class="mt-3 flex justify-end">
							<button
								type="button"
								class="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
								on:click={isAllPnlExpanded ? collapseAllPnlNodes : expandAllPnlNodes}
							>
								{isAllPnlExpanded ? 'Collapse all levels' : 'Expand all levels'}
							</button>
						</div>
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
											{@const isNetRow = row.id === 'net' && row.level === 0}
											<tr
												class={`whitespace-nowrap ${
													row.level === 0 ? 'font-semibold text-slate-900' : ''
												}`}
											>
												<td
													class={`sticky left-0 px-4 py-3 ${
														isNetRow
															? 'top-10 z-30 bg-slate-100 text-slate-900'
															: row.level === 0
																? 'z-10 bg-white text-slate-900'
																: 'z-10 bg-white'
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
															isNetRow ? 'sticky top-10 z-20 bg-slate-100' : ''
														} ${
															value === 0
																? 'text-slate-400'
																: value > 0
																	? 'text-emerald-600'
																	: 'text-rose-600'
														}
														}`}
													>
														{value === 0 ? '-' : formatWholeCurrency(value)}
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
							<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
								<thead
									class="sticky top-0 z-40 bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
								>
									<tr>
										<th class="sticky top-0 left-0 z-50 min-w-[160px] bg-slate-50 px-4 py-3">
											<button
												type="button"
												class="inline-flex items-center gap-1 text-left"
												on:click={() => toggleTransactionSort('assetName')}
											>
												<span>Asset</span>
												<span class="text-[10px] text-slate-400">
													{transactionSortKey === 'assetName'
														? transactionSortDirection === 'asc'
															? '▲'
															: '▼'
														: '↕'}
												</span>
											</button>
										</th>
										<th
											class="sticky top-0 z-50 min-w-[160px] bg-slate-50 px-4 py-3"
											style="left: 160px;"
										>
											<button
												type="button"
												class="inline-flex items-center gap-1 text-left"
												on:click={() => toggleTransactionSort('accountName')}
											>
												<span>Account</span>
												<span class="text-[10px] text-slate-400">
													{transactionSortKey === 'accountName'
														? transactionSortDirection === 'asc'
															? '▲'
															: '▼'
														: '↕'}
												</span>
											</button>
										</th>
										<th
											class="sticky top-0 z-50 min-w-[110px] bg-slate-50 px-4 py-3"
											style="left: 320px;"
										>
											<button
												type="button"
												class="inline-flex items-center gap-1 text-left"
												on:click={() => toggleTransactionSort('type')}
											>
												<span>Type</span>
												<span class="text-[10px] text-slate-400">
													{transactionSortKey === 'type'
														? transactionSortDirection === 'asc'
															? '▲'
															: '▼'
														: '↕'}
												</span>
											</button>
										</th>
										<th
											class="sticky top-0 z-50 min-w-[140px] bg-slate-50 px-4 py-3"
											style="left: 430px;"
										>
											<button
												type="button"
												class="inline-flex items-center gap-1 text-left"
												on:click={() => toggleTransactionSort('category')}
											>
												<span>Category</span>
												<span class="text-[10px] text-slate-400">
													{transactionSortKey === 'category'
														? transactionSortDirection === 'asc'
															? '▲'
															: '▼'
														: '↕'}
												</span>
											</button>
										</th>
										<th
											class="sticky top-0 z-50 min-w-[220px] bg-slate-50 px-4 py-3"
											style="left: 570px;"
										>
											<button
												type="button"
												class="inline-flex items-center gap-1 text-left"
												on:click={() => toggleTransactionSort('description')}
											>
												<span>Description</span>
												<span class="text-[10px] text-slate-400">
													{transactionSortKey === 'description'
														? transactionSortDirection === 'asc'
															? '▲'
															: '▼'
														: '↕'}
												</span>
											</button>
										</th>
										{#each transactionPivot.headers as header}
											<th class="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-right">{header}</th>
										{/each}
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-100 text-slate-700">
									<tr class="font-semibold text-slate-900">
										<td class="sticky top-10 left-0 z-40 bg-slate-100 px-4 py-3">Total</td>
										<td class="sticky top-10 z-40 bg-slate-100 px-4 py-3" style="left: 160px;">
											All accounts
										</td>
										<td class="sticky top-10 z-40 bg-slate-100 px-4 py-3" style="left: 320px;">
											All types
										</td>
										<td class="sticky top-10 z-40 bg-slate-100 px-4 py-3" style="left: 430px;">
											All categories
										</td>
										<td class="sticky top-10 z-40 bg-slate-100 px-4 py-3" style="left: 570px;">
											All descriptions
										</td>
										{#each transactionPivot.totalValues as value}
											<td
												class={`sticky top-10 z-30 bg-slate-100 px-4 py-3 text-right ${
													value === 0
														? 'text-slate-500'
														: value > 0
															? 'text-emerald-700'
															: 'text-rose-700'
												}`}
											>
												{value === 0 ? '-' : formatWholeCurrency(value)}
											</td>
										{/each}
									</tr>
									{#each transactionPivot.rows as row}
										<tr
											class="whitespace-nowrap"
										>
											<td class="sticky left-0 z-10 bg-white px-4 py-3">{row.assetName}</td>
											<td class="sticky z-10 bg-white px-4 py-3" style="left: 160px;">
												{row.accountName}
											</td>
											<td class="sticky z-10 bg-white px-4 py-3" style="left: 320px;">
												{row.type}
											</td>
											<td class="sticky z-10 bg-white px-4 py-3" style="left: 430px;">
												{row.category}
											</td>
											<td class="sticky z-10 bg-white px-4 py-3" style="left: 570px;">
												{row.description}
											</td>
											{#each row.values as value}
												<td
													class={`px-4 py-3 text-right ${
														value === 0
															? 'text-slate-400'
															: row.type === 'Transfer'
																? 'text-amber-600'
																: value > 0
																? 'text-emerald-600'
																: 'text-rose-600'
													}`}
												>
													{value === 0 ? '-' : formatWholeCurrency(value)}
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
					<AssetsTab
						data={{ assetsList, assetAccountsList, accountsList }}
						person={{
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
						}}
						cashflow={{
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
						}}
						share={{
							shareDetails,
							shareErrors,
							expandedShareDetailIds,
							toggleShareDetails,
							setShareDetails,
							setShareError,
							updateShareDetails
						}}
						property={{
							propertyDetails,
							propertyErrors,
							expandedPropertyDetailIds,
							togglePropertyDetails,
							setPropertyDetails,
							setPropertyError,
							updatePropertyDetails
						}}
						mortgage={{
							mortgageDetails,
							mortgageErrors,
							expandedMortgageDetailIds,
							toggleMortgageDetails,
							setMortgageDetails,
							setMortgageError,
							updateMortgageDetails,
							validateMortgageDetails
						}}
						ui={{
							stepForValue,
							scheduleUpdate,
							formatLabel,
							toMonthYearInput,
							roundToTwo,
							formatRate,
							formatYearMonthInput
						}}
					/>
				{:else if assetPanelTab === 'accounts'}
					<AccountsTab
						data={{ accountsList, accountEditDrafts, accountInterestRates, accountInlineError }}
						actions={{
							setAccountEditDraft,
							saveAccountEditDraft,
							setAccountInterestRate,
							adjustAccountInterestRate,
							updateAccountInterestRate
						}}
						ui={{ toMonthYearInput, scheduleUpdate, formatRate, roundToTwo, formatLabel }}
					/>
				{:else if assetPanelTab === 'transfers'}
					<TransfersTab
						data={{
							transferCashflows,
							transferEditDrafts,
							transferAccountOptions,
							transferInlineError,
							transferFormError,
							transferDraft
						}}
						handlers={{
							onTransferDraftChange: setTransferDraft,
							setTransferEditDraft,
							saveTransferEditDraft,
							onTransferInflationToggle: handleTransferInflationToggle,
							requestDeleteCashflow,
							createTransferCashflow
						}}
						ui={{ formatLabel, cashflowFrequencyOptions, toMonthYearInput, scheduleUpdate }}
					/>
				{:else if assetPanelTab === 'reserves'}
					<ReservesTab
						data={{
							fundingCashAccountOptions,
							fundingReserveDrafts,
							fundingReservePriorityRowCount,
							fundingReserveRulesByAccount,
							fundingReserveSourceOptionsByAccount,
							transferAccountOptions,
							fundingTabError
						}}
						actions={{
							setFundingReserveDraft,
							upsertFundingTargetForAccount,
							moveReserveRule,
							removeReserveRule,
							addReserveRuleForTarget
						}}
						ui={{ scheduleUpdate }}
					/>
				{:else if assetPanelTab === 'caps'}
					<CapsTab
						data={{
							fundingCashAccountOptions,
							fundingCapDrafts,
							fundingCapPriorityRowCount,
							fundingSweepRulesByAccount,
							fundingSweepDestinationOptionsByAccount,
							transferAccountOptions,
							fundingTabError
						}}
						actions={{
							setFundingCapDraft,
							upsertFundingTargetForAccount,
							moveSweepRule,
							removeSweepRule,
							addSweepRuleForSource
						}}
						ui={{ scheduleUpdate }}
					/>
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
						<InfoTooltip label="What is Stage 1 liquidity?">
								Stage 1 checks whether you are living within your means by seeing if you run out of
								accessible money in any month. Accessible money is in either cash accounts, shares
								or pension/superannuation funds (if available).
						</InfoTooltip>
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
						<InfoTooltip label="What is Stage 2 allocation?">
								Now that we've established you have enough to live on we need to ensure all of your
								accounts remain in the black. Stage 2 is about allocating funds to the right
								accounts at the right time.
						</InfoTooltip>
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
						<InfoTooltip label="What is Stage 3 safety?">
								Stage 3 sets reserve minimums so essential spending is protected. This stage focuses
								on safety buffer and resilience.
						</InfoTooltip>
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
				{#if stage3Reached && stage3Assessment}
					<div class="mt-3 space-y-2 text-xs text-sky-900">
						<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
								<div class="flex items-center gap-1">
									<span class="font-semibold">Safety Buffer Score</span>
									<InfoTooltip label="What is the Stage 3 safety buffer score?" theme="sky">
											Measures how many months you could survive on your liquid buffer given living
											expenses, asset ownership expenses and mortgage repayments. Current coverage is
											{Math.floor(stage3Assessment.safetyMonths)} months.
									</InfoTooltip>
								</div>
								<span class="font-semibold">{stage3Assessment.safetyScore}/100</span>
						</div>
						<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
								<div class="flex items-center gap-1">
									<span class="font-semibold">Resilience Score</span>
									<InfoTooltip label="What is the Stage 3 resilience score?" theme="sky">
											Measures the largest drop in liquidity over any rolling 12-month window in
											your projection. Worst window:
											{stage3Assessment.worstDrawdownStartDate
												? monthLabelFromDate(stage3Assessment.worstDrawdownStartDate)
												: 'N/A'}{' '}
											to{' '}
											{stage3Assessment.worstDrawdownEndDate
												? monthLabelFromDate(stage3Assessment.worstDrawdownEndDate)
												: 'N/A'}
											, drawdown: {stage3Assessment.worstDrawdownPct}%.
									</InfoTooltip>
								</div>
								<span class="font-semibold">{stage3Assessment.resilienceScore}/100</span>
						</div>
					</div>
				{/if}
				{#if stage3Reached && plannerAdvancedOpenStage === 'stage3' && !stage3Passed}
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
						<InfoTooltip label="What is Stage 4 growth efficiency?">
								Stage 4 sets cap and sweep settings so excess cash can move to growth assets while
								still respecting reserves. This stage focuses on growth allocation and goal match.
						</InfoTooltip>
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
											<InfoTooltip label="What is the Stage 4 growth allocation score?" theme="sky">
													Shows how much of current value is in growth assets (shares, super, property)
													versus defensive cash. Current growth allocation is
													{stage3Assessment.growthAllocationPct}%.
											</InfoTooltip>
										</div>
										<span class="font-semibold">{stage3Assessment.growthScore}/100</span>
									</div>
									<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
										<div class="flex items-center gap-1">
											<span class="font-semibold">Goal Match Score</span>
											<InfoTooltip label="What is the Stage 4 goal match score?" theme="sky">
													Checks whether growth allocation fits your projection horizon. Current horizon
													is {stage3Assessment.horizonMonths} months.
											</InfoTooltip>
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


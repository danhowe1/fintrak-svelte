<script lang="ts">
	import type { PageData } from './$types';
	import { afterUpdate, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';
	import {
		formatYearMonthInput,
		fromYearMonthInt,
		normalizeYearMonthValue
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

let projectionData = data.projection;
let sessionRates = data.sessionRates;
let projectionVersion = 1;
let projectionError: string | null = null;
let cashflows = data.cashflows ?? [];
let autoRunProjection = true;

const chartColors = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0f172a'];
const cashflowCategoryOptions = [
	{ value: 'living_expenses', label: 'Living expenses' },
	{ value: 'employment_income', label: 'Employment income' },
	{ value: 'rental_income', label: 'Rental income' },
	{ value: 'asset_ownership', label: 'Asset ownership' }
];
const personIncomeCategoryOptions = [{ value: 'employment_income', label: 'Employment income' }];
const propertyIncomeCategoryOptions = [
	{ value: 'rental_income', label: 'Rental income' }
];
const propertyExpenseCategoryOptions = [
	{ value: 'asset_ownership', label: 'Asset ownership' }
];
const cashflowFrequencyOptions = [
	{ value: 'monthly', label: 'Monthly' },
	{ value: 'quarterly', label: 'Quarterly' },
	{ value: 'annually', label: 'Annually' },
	{ value: 'one_time', label: 'One time' }
];

type ProjectionRange = '1y' | '5y' | '10y' | 'all';
type AssetPanelTab = 'assets' | 'accounts' | 'transfers';
type ProjectionBalanceSource = 'accounts' | 'assets' | 'net_worth';
type CashflowDraft = {
	type: 'income' | 'expense';
	category:
		| 'living_expenses'
		| 'employment_income'
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
let projectionBalanceSource: ProjectionBalanceSource = 'accounts';
let projectionRange: ProjectionRange = normalizeProjectionRange(data.projectionRange);
let assetPanelTab: AssetPanelTab = 'assets';
let isUpdating = false;
let updateLocks = new Set<string>();
let expandedPnlNodes = new Set<string>();
let assetsList = data.assets ?? [];
let accountsList = data.accounts ?? [];
let assetAccountsList = data.assetAccounts ?? [];
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
let activeCashflowForm: { assetId: string; type: 'income' | 'expense'; cashflowId?: string } | null =
	null;
let cashflowDrafts: Record<string, CashflowDraft> = {};
let cashflowsByAssetId: Record<string, typeof cashflows> = {};
let editingCashflowIds = new Set<string>();
let expandedPersonDetailIds = new Set<string>();
let expandedPropertyDetailIds = new Set<string>();
let expandedMortgageDetailIds = new Set<string>();
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
		amount: string;
		frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
		startDate: string;
		endDate: string;
		description: string;
	}
> = {};

const getRetirementAge = (asset: { details?: Record<string, unknown> }) => {
	const details = asset.details ?? {};
	const raw = details.retirementAge;
	const value = typeof raw === 'number' ? raw : Number(raw);
	return Number.isFinite(value) ? value : 0;
};

$: assetsList = data.assets ?? [];
$: accountsList = data.accounts ?? [];
$: assetAccountsList = data.assetAccounts ?? [];

$: if (data.scenario.id !== lastScenarioId) {
	personRetirementAges = {};
	personDetails = {};
	cashflowAmounts = {};
	propertyDetails = {};
	accountInterestRates = {};
	propertyErrors = {};
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
	transferFormError = '';
	transferInlineError = '';
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
				startDate: formatYearMonthInput(asset.details?.startDate),
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
			const rawStartDate = details.startDate;
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
				variableSellingCosts: Number.isFinite(variableSellingCosts)
					? variableSellingCosts
					: 0
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
		const termYears =
			typeof rawTermYears === 'number' ? rawTermYears : Number(rawTermYears ?? 0);
		const termMonths =
			typeof rawTermMonths === 'number' ? rawTermMonths : Number(rawTermMonths ?? 0);
		const rawOpeningBalance = account?.details?.openingBalance;
		const openingBalance =
			typeof rawOpeningBalance === 'number' ? rawOpeningBalance : Number(rawOpeningBalance ?? 0);
		next[asset.id] = {
			name: asset.name ?? '',
			startDate: formatYearMonthInput(details.startDate),
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

const setPersonDetails = (id: string, value: { name: string; startDate: string; dob: string }) => {
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

$: transferCashflows = (cashflows ?? []).filter((cashflow) => cashflow.cashflow_type === 'transfer');

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
					(account.account_type === 'brokerage' &&
						sharesBrokerageAccountIds.has(account.id)))
		)
		.map((account) => ({ id: account.id, name: account.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
})();

$: if (!transferDraft.startDate) {
	transferDraft = {
		...transferDraft,
		startDate:
			toMonthYearInput(projectionData.startDate) ||
			toMonthYearInput(assetsList[0]?.details?.startDate) ||
			toMonthYearInput(accountsList[0]?.details?.startDate) ||
			''
	};
}

$: {
	const nextDrafts = { ...transferEditDrafts };
	let changed = false;
	for (const transfer of transferCashflows) {
		if (nextDrafts[transfer.id]) continue;
		nextDrafts[transfer.id] = {
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
	const accountsById = new Map(accountsList.map((account) => [account.id, account]));
	return assetAccountsList
		.filter((link) => link.asset_id === assetId && link.relationship_role === 'held_in')
		.map((link) => ({
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
			assetsList.find((asset) => asset.asset_type === 'person')?.details?.startDate ??
				accountsList[0]?.details?.startDate ??
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
				? cashflow.source_asset_account_id ?? ''
				: cashflow.destination_asset_account_id ?? '',
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

const setCashflowDraft = (
	key: string,
	updates: Partial<CashflowDraft>
) => {
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
	field: 'name' | 'startDate' | 'saleDate' | 'marketValue' | 'fixedSellingCosts' | 'variableSellingCosts',
	message: string
) => {
	propertyErrors = { ...propertyErrors, [id]: { ...(propertyErrors[id] ?? {}), [field]: message } };
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
	field: 'name' | 'startDate' | 'termYears' | 'termMonths' | 'mortgageAccountName' | 'openingBalance',
	message: string
) => {
	mortgageErrors = { ...mortgageErrors, [id]: { ...(mortgageErrors[id] ?? {}), [field]: message } };
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
		projectionData = payload.projection;
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
				await refreshProjection({ force: true });
			},
			true
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
		projectionError =
			error instanceof Error ? error.message : 'Unable to update retirement age.';
	});
};

const updatePersonDetails = async (assetId: string, name: string, startDate: string, dob: string) => {
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
		projectionError =
			error instanceof Error ? error.message : 'Unable to update person details.';
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
			cashflowFormErrors = { ...cashflowFormErrors, [assetId]: '' };
			activeCashflowForm = null;
		},
		autoRunProjection
	).catch((error) => {
		cashflowFormErrors = {
			...cashflowFormErrors,
			[assetId]: error instanceof Error ? error.message : 'Unable to create cashflow.'
		};
		projectionError =
			error instanceof Error ? error.message : 'Unable to create cashflow.';
	});
};

const updateAssetCashflow = async (
	assetId: string,
	cashflowId: string,
	draft: CashflowDraft
) => {
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
		projectionError =
			error instanceof Error ? error.message : 'Unable to update cashflow.';
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
					message =
						payload?.error ??
						payload?.data?.error ??
						payload?.message ??
						message;
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
		transferFormError =
			error instanceof Error ? error.message : 'Unable to create transfer.';
		projectionError =
			error instanceof Error ? error.message : 'Unable to create transfer.';
	});
};

const updateTransferInflationAffected = async (cashflowId: string, inflationAffected: boolean) => {
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
	if (!Number.isFinite(amountValue) || amountValue <= 0) {
		transferInlineError = 'Transfer amount must be greater than 0.';
		return;
	}
	if (!isValidMonthYear(draft.startDate)) {
		transferInlineError = 'Transfer start date must use MM YYYY.';
		return;
	}
	if (draft.frequency !== 'one_time' && draft.endDate.trim() && !isValidMonthYear(draft.endDate)) {
		transferInlineError = 'Transfer end date must use MM YYYY.';
		return;
	}

	await withLock(
		`transfer-edit:${cashflowId}`,
		async () => {
			const formData = new FormData();
			formData.set('scenarioId', data.scenario.id);
			formData.set('cashflowId', cashflowId);
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
						amount: String(refreshedTransfer.amount ?? ''),
						frequency: refreshedTransfer.frequency,
						startDate: toMonthYearInput(refreshedTransfer.start_date),
						endDate: refreshedTransfer.end_date ? toMonthYearInput(refreshedTransfer.end_date) : '',
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
		projectionError =
			error instanceof Error ? error.message : 'Unable to delete cashflow.';
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

	const updateRates = async (deltaInflation: number, deltaInterest: number) => {
		await withLock(
			'updateRates',
			async () => {
				const formData = new FormData();
				formData.set('inflationRate', String(sessionRates.inflationRate));
				formData.set('interestRateChange', String(sessionRates.interestRateChange));
				formData.set('deltaInflation', String(deltaInflation));
				formData.set('deltaInterest', String(deltaInterest));
				await fetch('?/updateRates', { method: 'POST', body: formData });
				await refreshProjection({ force: true });
			},
			true
		).catch((error) => {
			projectionError =
				error instanceof Error ? error.message : 'Unable to refresh the projection.';
		});
	};

	const parseYearMonth = (value: unknown) => {
		const normalized = normalizeYearMonthValue(value);
		return normalized === null ? null : fromYearMonthInt(normalized);
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

	const normalizeAccountSeries = (series: { accountId: string; accountName: string; points: any[] }) => ({
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
				return account?.account_type !== 'brokerage';
			})
			.map(normalizeAccountSeries);
		const assetSeries = (projectionData.assets ?? []).map(normalizeAssetSeries);
		const activeSeries =
			projectionBalanceSource === 'assets'
				? assetSeries
				: projectionBalanceSource === 'net_worth'
					? (() => {
							const byDate = new Map<number, { monthLabel: string; balance: number }>();
							for (const series of [...accountSeries, ...assetSeries]) {
								for (const point of series.points) {
									const existing = byDate.get(point.date);
									if (!existing) {
										byDate.set(point.date, {
											monthLabel: point.monthLabel,
											balance: point.balance
										});
									} else {
										existing.balance += point.balance;
									}
								}
							}
							const points = Array.from(byDate.entries())
								.sort((a, b) => a[0] - b[0])
								.map(([date, point]) => ({
									date,
									monthLabel: point.monthLabel,
									balance: point.balance
								}));
							return [
								{
									id: 'net_worth',
									name: 'Net worth',
									points
								}
							] as ChartSeries[];
						})()
					: accountSeries;

		if (projectionRange === '10y' || projectionRange === 'all') {
			return {
				series: activeSeries.map((series) => ({
					...series,
					points: getAnnualPoints(series.points)
				})),
				transactions: projectionData.transactions ?? []
			};
		}
		return {
			series: activeSeries,
			transactions: projectionData.transactions ?? []
		};
	})();
	$: totalSeries = (() => {
		const seriesList = chartProjection.series ?? [];
		if (!seriesList.length || projectionBalanceSource === 'net_worth') return null;
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
		totalSeries ? [...chartProjection.series, normalizeAccountSeries(totalSeries)] : chartProjection.series
	);
	$: chartAxisPoints = (() => {
		const basePointsRaw = projectionData.accounts?.[0]?.points ?? chartProjection.series[0]?.points ?? [];
		const basePoints =
			projectionRange === '10y' || projectionRange === 'all'
				? getAnnualPoints(basePointsRaw)
				: basePointsRaw;
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
		if (projectionData.transactions.length === 0) return [];
		const headers = chartAxisPoints.map((point) => point.monthLabel);
		const indexByLabel = new Map<string, number>();
		headers.forEach((label, index) => indexByLabel.set(label, index));

		const buildMaps = () =>
			new Map<string, Map<string, Map<string, number[]>>>();
		const incomeMap = buildMaps();
		const expenseMap = buildMaps();

		for (const transaction of projectionData.transactions) {
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

			const categoryMap =
				targetMap.get(accountName) ?? new Map<string, Map<string, number[]>>();
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

				for (const category of Array.from(categoryMap.keys()).sort((a, b) =>
					a.localeCompare(b)
				)) {
					const descMap = categoryMap.get(category)!;
					const descNodes: PnlNode[] = [];
					const descTotals: number[][] = [];
					const noDescriptionTotals: number[] = Array(headers.length).fill(0);

					for (const description of Array.from(descMap.keys()).sort((a, b) =>
						a.localeCompare(b)
					)) {
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
						const yValue =
							typeof context?.parsed?.y === 'number' ? context.parsed.y : 0;
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

	$: if (chart && projectionView === 'balances' && projectionVersion && projectionBalanceSource) {
		chart.data = buildChartData();
		chart.options = buildChartOptions();
		chart.update();
	}

	afterUpdate(() => {
		initChart();
	});
</script>

<section class="not-prose mt-6">
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
		<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold text-slate-900">
			Projections for {data.scenario.name} ({formatYearMonthInput(projectionData.startDate)})
		</h2>
		<div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
			{#if projectionView === 'balances' || projectionView === 'balance_sheet'}
				<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
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
							projectionBalanceSource === 'net_worth'
								? 'bg-slate-900 text-white'
								: 'text-slate-600 hover:text-slate-900'
						}`}
						on:click={() => (projectionBalanceSource = 'net_worth')}
					>
						Net worth
					</button>
				</div>
			{/if}
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
			<div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
				<span>Auto-run</span>
				<button
					type="button"
					class={`rounded-full px-2 py-0.5 transition ${
						autoRunProjection
							? 'bg-emerald-600 text-white'
							: 'bg-slate-200 text-slate-700'
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
			<span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
					on:click={() => updateRates(-0.5, 0)}
				>
					-
				</button>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(0.5, 0)}
				>
					+
				</button>
			</div>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Interest rate change
			</span>
			<span class="text-sm font-semibold text-slate-900">
				{formatRate(sessionRates.interestRateChange, 2)}%
			</span>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(0, -0.25)}
				>
					-
				</button>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(0, 0.25)}
				>
					+
				</button>
			</div>
		</div>
	</div>
	{#if projectionError}
		<div class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
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
			<div class="relative mt-4 max-h-96 overflow-x-auto overflow-y-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
					<thead
						class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
					>
						<tr>
							<th class="sticky left-0 top-0 z-20 bg-slate-50 px-4 py-3">Line item</th>
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
				{#if isUpdating}
					<div class="absolute inset-0 grid place-items-center bg-white/70">
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
			<div class="relative mt-4 max-h-96 overflow-x-auto overflow-y-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
					<thead
						class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
					>
						<tr>
							<th class="sticky left-0 top-0 z-20 bg-slate-50 px-4 py-3">Item</th>
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
									<div class="flex items-center gap-2" style={`padding-left: ${row.level * 14}px`}>
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
				{#if isUpdating}
					<div class="absolute inset-0 grid place-items-center bg-white/70">
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
	{:else if projectionData.transactions.length === 0}
		<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
	{:else}
		<div class="relative mt-4 max-h-96 overflow-x-auto overflow-y-auto">
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
					{#each projectionData.transactions as transaction}
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
			{#if isUpdating}
				<div class="absolute inset-0 grid place-items-center bg-white/70">
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
		<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<h3 class="text-sm font-semibold text-slate-900">Events</h3>
			{#if (projectionData.events?.length ?? 0) > 0}
				<div class="mt-3 space-y-2">
					{#each projectionData.events as event}
						<div
							class={`rounded-lg border px-3 py-2 text-sm ${
								event.tone === 'negative'
									? 'border-rose-200 bg-rose-50 text-rose-700'
									: 'border-emerald-200 bg-emerald-50 text-emerald-700'
							}`}
						>
							{event.message}
						</div>
					{/each}
				</div>
			{:else}
				<div class="mt-3 text-sm text-slate-600">No events for this projection.</div>
			{/if}
		</div>
	</div>
</section>

<section class="not-prose mt-6">
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
		<div>
			<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
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
				</div>
				{#if assetPanelTab === 'assets'}
			<div class="assets-cards mt-5 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
			{#each assetsList.filter((asset) => asset.asset_type === 'person') as person}
				<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
					<h3 class="text-sm font-semibold text-slate-900">
						{personDetails[person.id]?.name ?? person.name}
					</h3>
					<div class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Retirement age</span>
						<input
							type="number"
							class="justify-self-end w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
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
							aria-label={expandedPersonDetailIds.has(person.id) ? 'Hide details' : 'Show details'}
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Start date (MM YYYY)</span>
							<div class="justify-self-end flex flex-col items-end">
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Name</span>
							<div class="justify-self-end flex flex-col items-end">
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
											updatePersonDetails(
												person.id,
												next,
												current.startDate,
												current.dob
											)
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Date of birth (MM YYYY)</span>
							<div class="justify-self-end flex flex-col items-end">
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
												updatePersonDetails(
													person.id,
													current.name,
													current.startDate,
													next
												)
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
									cashflow.cashflow_type === 'income'
										? 'text-emerald-600'
										: 'text-rose-600'
								}`}
							>
								<span class="truncate">
									{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
								</span>
								<input
									type="number"
									class="justify-self-end w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
												inflationAffected: (event.currentTarget as HTMLInputElement)
													.checked
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
												? updateAssetCashflow(
														person.id,
														activeCashflowForm.cashflowId,
														draft
													)
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
				{@const brokerageLink = assetAccountsList.find(
					(link) => link.asset_id === share.id && link.relationship_role === 'held_in'
				)}
				{@const brokerageAccount = brokerageLink
					? accountsList.find((account) => account.id === brokerageLink.account_id)
					: null}
				<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
					<h3 class="truncate text-sm font-semibold text-slate-900">{share.name}</h3>
					<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Start date</span>
						<span class="justify-self-end text-slate-900">
							{formatYearMonthInput(share.details?.startDate)}
						</span>
						<span></span>
					</div>
					<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Capital growth rate</span>
						<span class="justify-self-end text-slate-900">
							{formatRate(Number(share.details?.capitalGrowthRate ?? 0), 2)}%
						</span>
						<span></span>
					</div>
					<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Dividend yield</span>
						<span class="justify-self-end text-slate-900">
							{formatRate(Number(share.details?.dividendYield ?? 0), 2)}%
						</span>
						<span></span>
					</div>
					<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Dividends taken as income</span>
						<span class="justify-self-end text-slate-900">
							{formatYearMonthInput(share.details?.dividendsTakenAsIncomeDate)}
						</span>
						<span></span>
					</div>
					<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Brokerage account</span>
						<span class="justify-self-end text-slate-900">
							{brokerageAccount?.name ?? '—'}
						</span>
						<span></span>
					</div>
				</div>
			{/each}
			{#each assetsList.filter((asset) => asset.asset_type === 'property') as property}
				<div class="flex w-fit max-w-xs flex-col gap-0.5">
				<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
					<h3 class="text-sm font-semibold text-slate-900">
						{propertyDetails[property.id]?.name ?? property.name}
					</h3>
					<div class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Market growth rate</span>
						<input
							type="number"
							class="justify-self-end w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
							value={formatRate(propertyDetails[property.id]?.marketGrowthRate ?? 0, 1)}
							step="0.5"
							on:input={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = propertyDetails[property.id] ?? {
									name: property.name,
									startDate: formatYearMonthInput(property.details?.startDate),
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
									startDate: formatYearMonthInput(property.details?.startDate),
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
						<button
							type="button"
							class="flex items-center justify-end text-slate-500 hover:text-slate-700"
							aria-label={expandedPropertyDetailIds.has(property.id) ? 'Hide details' : 'Show details'}
							title={expandedPropertyDetailIds.has(property.id) ? 'Hide details' : 'Show details'}
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Start date (MM YYYY)</span>
							<div class="justify-self-end flex flex-col items-end">
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Name</span>
							<div class="justify-self-end flex flex-col items-end">
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Market value</span>
							<div class="justify-self-end flex flex-col items-end">
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Fixed selling costs</span>
							<div class="justify-self-end flex flex-col items-end">
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
										setPropertyDetails(property.id, { ...current, fixedSellingCosts: next });
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
						<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">Variable selling costs (%)</span>
							<div class="justify-self-end flex flex-col items-end">
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
										setPropertyDetails(property.id, { ...current, variableSellingCosts: next });
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
					<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Sale date (MM YYYY)</span>
						<div class="justify-self-end flex flex-col items-end">
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
										startDate: formatYearMonthInput(property.details?.startDate),
										marketValue: Number(property.details?.marketValue) || 0,
										marketGrowthRate: 0,
										saleDate: '',
										fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
										variableSellingCosts: Number(property.details?.variableSellingCosts) || 0
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
										startDate: formatYearMonthInput(property.details?.startDate),
										marketValue: Number(property.details?.marketValue) || 0,
										marketGrowthRate: 0,
										saleDate: '',
										fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
										variableSellingCosts: Number(property.details?.variableSellingCosts) || 0
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
						<span></span>
					</div>
					<div class="mt-3 space-y-2">
						{#each cashflowsByAssetId[property.id] ?? [] as cashflow}
							<div
								class={`grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs ${
									cashflow.cashflow_type === 'income'
										? 'text-emerald-600'
										: 'text-rose-600'
								}`}
							>
								<span class="truncate">
									{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
								</span>
								<input
									type="number"
									class="justify-self-end w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
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
										const next = Number(
											(event.currentTarget as HTMLInputElement).value
										);
										const value = Number.isFinite(next) ? next : 0;
										setCashflowAmount(cashflow.id, value);
									}}
									on:change={(event) => {
										const next = Number(
											(event.currentTarget as HTMLInputElement).value
										);
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
								<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
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
												inflationAffected: (event.currentTarget as HTMLInputElement)
													.checked
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
					<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
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
								title={expandedMortgageDetailIds.has(mortgage.id) ? 'Hide details' : 'Show details'}
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
							<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
								<span class="truncate text-slate-500">Start date (MM YYYY)</span>
								<div class="justify-self-end flex flex-col items-end">
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
							<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
								<span class="truncate text-slate-500">Mortgage name</span>
								<div class="justify-self-end flex flex-col items-end">
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
							<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
								<span class="truncate text-slate-500">Term remaining (years)</span>
								<div class="justify-self-end flex flex-col items-end">
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
												termYears: Number.isFinite(next)
													? Math.max(0, Math.round(next))
													: 0
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
							<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
								<span class="truncate text-slate-500">Term remaining (months)</span>
								<div class="justify-self-end flex flex-col items-end">
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
											if (
												!current ||
												!Number.isFinite(next) ||
												next < 0 ||
												next > 11
											) {
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
							<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
								<span class="truncate text-slate-500">Mortgage account name</span>
								<div class="justify-self-end flex flex-col items-end">
									<input
										type="text"
										class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={mortgageDetails[mortgage.id]?.mortgageAccountName ?? ''}
										on:input={(event) => {
											const next = (event.currentTarget as HTMLInputElement).value;
											const current = mortgageDetails[mortgage.id];
											if (!current) return;
											setMortgageDetails(mortgage.id, { ...current, mortgageAccountName: next });
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
							<div class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
								<span class="truncate text-slate-500">Opening balance</span>
								<div class="justify-self-end flex flex-col items-end">
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
												setMortgageError(mortgage.id, 'openingBalance', 'Use a valid number.');
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
					<div class="accounts-cards mt-5 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
						{#if accountsList.length > 0}
							{#each accountsList as account}
								<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
									<h3 class="truncate text-sm font-semibold text-slate-900">{account.name}</h3>
									<div class="mt-3 text-xs text-slate-500">Account type</div>
									<div class="text-xs text-slate-700">{formatLabel(account.account_type)}</div>
								</div>
							{/each}
						{:else}
							<div class="text-sm text-slate-600">No accounts to show yet.</div>
						{/if}
					</div>
				{:else}
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
													<td class="px-2 py-2">{transfer.source_account_name ?? '—'}</td>
													<td class="px-2 py-2">{transfer.destination_account_name ?? '—'}</td>
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
																	.value as
																	| 'monthly'
																	| 'quarterly'
																	| 'annually'
																	| 'one_time';
																setTransferEditDraft(transfer.id, {
																	frequency: nextFrequency,
																	endDate:
																		nextFrequency === 'one_time'
																			? ''
																			: transferDraftRow?.endDate ?? ''
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
															value={transferDraftRow?.startDate ?? toMonthYearInput(transfer.start_date)}
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
																value={transferDraftRow?.endDate ?? toMonthYearInput(transfer.end_date)}
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
				{/if}
			</div>
		</div>
		<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<h3 class="text-sm font-semibold text-slate-900">Interest Rates</h3>
			{#if accountsList.length > 0}
				<div class="mt-3 space-y-2">
					{#each accountsList as account}
						<div class="grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600">
							<span class="truncate text-slate-500">{account.name}</span>
							<input
								type="number"
								class="no-spin justify-self-end w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
								value={formatRate(accountInterestRates[account.id] ?? 0, 2)}
								step="0.01"
								on:input={(event) => {
									const next = Number((event.currentTarget as HTMLInputElement).value);
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
									const next = Number((event.currentTarget as HTMLInputElement).value);
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
									class="grid h-3.5 w-6 place-items-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600 hover:bg-slate-50"
									aria-label={`Increase ${account.name} interest rate`}
									on:click={() => adjustAccountInterestRate(account.id, 0.25)}
								>
									▲
								</button>
								<button
									type="button"
									class="grid h-3.5 w-6 place-items-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600 hover:bg-slate-50"
									aria-label={`Decrease ${account.name} interest rate`}
									on:click={() => adjustAccountInterestRate(account.id, -0.25)}
								>
									▼
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="mt-3 text-sm text-slate-600">No accounts to show yet.</div>
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

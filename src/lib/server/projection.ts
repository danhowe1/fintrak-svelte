import {
	type YearMonth,
	addMonthsToYearMonth,
	formatYearMonthLabel,
	fromYearMonthInt,
	monthsBetweenYearMonths,
	normalizeYearMonthValue,
	toYearMonthInt,
	yearMonthIndex
} from '$lib/yearMonth';

export type ProjectionTransaction = {
	cashflowId: string;
	cashflowType: 'expense' | 'income' | 'transfer' | 'valuation';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'misc_income'
		| 'dividend_income'
		| 'rental_income'
		| 'asset_ownership'
		| 'asset_sale'
		| 'shares_purchase'
		| 'shares_sale'
		| 'super_income'
		| 'capital_growth'
		| 'mortgage_repayment'
		| 'transfer'
		| 'interest';
	assetName?: string | null;
	description?: string | null;
	accountId: string;
	accountName: string;
	amount: number;
	date: number;
	monthLabel: string;
};

export type AccountBalancePoint = {
	date: number;
	monthLabel: string;
	balance: number;
};

export type AccountBalanceSeries = {
	accountId: string;
	accountName: string;
	points: AccountBalancePoint[];
};

export type AssetValuePoint = {
	date: number;
	monthLabel: string;
	value: number;
};

export type AssetValueSeries = {
	assetId: string;
	assetName: string;
	assetType: ProjectionAsset['asset_type'];
	points: AssetValuePoint[];
};

export type ProjectionResult = {
	startDate: number;
	endDate: number;
	transactions: ProjectionTransaction[];
	accounts: AccountBalanceSeries[];
	assets: AssetValueSeries[];
	liquidity: {
		series: {
			id: string;
			name: string;
			points: {
				date: number;
				monthLabel: string;
				balance: number;
			}[];
		}[];
		points: {
			date: number;
			monthLabel: string;
			balance: number;
		}[];
	};
	planner: {
		status: 'on_track' | 'needs_attention';
		headline: string;
		firstShortfall: {
			targetAccountId: string;
			targetAccountName: string;
			minBalance: number;
			startDate: number;
			monthLabel: string;
			availableSourceAccounts: {
				accountId: string;
				accountName: string;
				availableNow: boolean;
				availableFromDate: number | null;
			}[];
		} | null;
	};
	events: {
		tone: 'negative' | 'positive';
		monthLabel: string | null;
		message: string;
	}[];
};

type ProjectionCashflow = {
	id: string;
	cashflow_type: 'expense' | 'income' | 'transfer';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'misc_income'
		| 'asset_ownership'
		| 'rental_income'
		| 'transfer'
		| 'shares_purchase'
		| 'shares_sale';
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
	amount: number;
	inflation_affected: boolean;
	start_date: number;
	end_date: number | null;
	source_account_id: string | null;
	destination_account_id: string | null;
	source_asset_name?: string | null;
	destination_asset_name?: string | null;
	description?: string | null;
};

type ProjectionAccount = {
	id: string;
	account_type:
		| 'cash_account'
		| 'mortgage_account'
		| 'credit_card'
		| 'brokerage'
		| 'super_account';
	name: string;
	start_date: number;
	opening_balance: number;
	details: Record<string, unknown>;
};

type ProjectionAsset = {
	asset_type: 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';
	start_date: number;
	details: Record<string, unknown>;
	id?: string;
	name?: string;
	property_id?: string | null;
	person_id?: string | null;
};

type ProjectionAssetAccount = {
	asset_id: string;
	account_id: string;
	relationship_role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
};

type ProjectionAutoFundingRule = {
	id: string;
	source_account_id: string;
	target_account_id: string;
	priority_order: number;
	enabled: boolean;
	min_target_balance: number;
};

type ProjectionAccountBalanceTarget = {
	account_id: string;
	min_balance: number;
	max_balance: number | null;
	enabled: boolean;
};

type ProjectionAutoSweepRule = {
	id: string;
	source_account_id: string;
	destination_account_id: string;
	priority_order: number;
	enabled: boolean;
};

const parseYearMonth = (value?: unknown): YearMonth | null => {
	const normalized = normalizeYearMonthValue(value);
	return normalized === null ? null : fromYearMonthInt(normalized);
};

const getNumberDetail = (details: Record<string, unknown>, key: string) => {
	const value = details?.[key];
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const getTermMonths = (details: Record<string, unknown>) => {
	const years = getNumberDetail(details, 'termYears') ?? 0;
	const months = getNumberDetail(details, 'termMonths') ?? 0;
	return years * 12 + months;
};

const getYoungestHundredYearMonth = (assets: ProjectionAsset[], fallbackStart: YearMonth) => {
	let youngestDob: YearMonth | null = null;
	for (const asset of assets) {
		if (asset.asset_type !== 'person') continue;
		const dobValue = asset.details?.dob;
		const dob = parseYearMonth(dobValue);
		if (!dob) continue;
		if (!youngestDob || monthsBetweenYearMonths(youngestDob, dob) > 0) {
			youngestDob = dob;
		}
	}

	const base = youngestDob ?? fallbackStart;
	return { year: base.year + 100, month: base.month };
};

const getInterestRate = (details: Record<string, unknown>) => {
	const value = details?.interestRate;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const formatEventCurrency = (value: number) => {
	if (!Number.isFinite(value)) return '$0';
	return `$${value.toLocaleString('en-AU', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	})}`;
};

const getFrequencyInterval = (frequency: ProjectionCashflow['frequency']) => {
	switch (frequency) {
		case 'monthly':
			return 1;
		case 'quarterly':
			return 3;
		case 'annually':
			return 12;
		case 'one_time':
			return 0;
		default:
			return 1;
	}
};

const maxYearMonth = (left: YearMonth | null, right: YearMonth | null): YearMonth | null => {
	if (!left) return right;
	if (!right) return left;
	return yearMonthIndex(left) >= yearMonthIndex(right) ? left : right;
};

export const buildProjection = (input: {
	inflationRate?: number | null;
	projectionRange?: '1y' | '5y' | '10y' | 'all';
	maxMonths?: number | null;
	cashflows: ProjectionCashflow[];
	accounts: ProjectionAccount[];
	assets: ProjectionAsset[];
	assetAccounts: ProjectionAssetAccount[];
	autoFundingRules?: ProjectionAutoFundingRule[];
	accountBalanceTargets?: ProjectionAccountBalanceTarget[];
	autoSweepRules?: ProjectionAutoSweepRule[];
}): ProjectionResult => {
	const startYearMonth = (() => {
		const candidates: YearMonth[] = [];
		for (const cashflow of input.cashflows) {
			const start = parseYearMonth(cashflow.start_date);
			if (start) candidates.push(start);
		}
		for (const account of input.accounts) {
			const start = parseYearMonth(account.start_date);
			if (start) candidates.push(start);
		}
		for (const asset of input.assets) {
			const start = parseYearMonth(asset.start_date);
			if (start) candidates.push(start);
		}
		if (candidates.length === 0) {
			return { year: new Date().getFullYear(), month: 1 };
		}
		return candidates.reduce((earliest, current) =>
			yearMonthIndex(current) < yearMonthIndex(earliest) ? current : earliest
		);
	})();

	const cappedEnd = (() => {
		const naturalEnd = getYoungestHundredYearMonth(input.assets, startYearMonth);
		if (!input.maxMonths || input.maxMonths <= 0) {
			return naturalEnd;
		}
		const capped = addMonthsToYearMonth(startYearMonth, input.maxMonths - 1);
		const naturalIndex = yearMonthIndex(naturalEnd);
		const cappedIndex = yearMonthIndex(capped);
		return cappedIndex < naturalIndex ? capped : naturalEnd;
	})();
	const alignToCompletedYearEnd = (end: YearMonth) => {
		if (end.month === 12) {
			return end;
		}
		return { year: end.year - 1, month: 12 };
	};
	const endYearMonth =
		input.projectionRange === '10y' || input.projectionRange === 'all'
			? alignToCompletedYearEnd(cappedEnd)
			: cappedEnd;
	const totalMonths = Math.max(0, monthsBetweenYearMonths(startYearMonth, endYearMonth));
	const inflationRate = input.inflationRate ?? 0;

	const accountMap = new Map(
		input.accounts.map((account) => [
			account.id,
			{
				name: account.name,
				type: account.account_type,
				interestRate: getInterestRate(account.details),
				startDate: parseYearMonth(account.start_date),
				openingBalance: Number.isFinite(account.opening_balance) ? account.opening_balance : 0,
				balance: 0
			}
		])
	);

	for (const [, accountInfo] of accountMap) {
		if (!accountInfo.startDate || monthsBetweenYearMonths(accountInfo.startDate, startYearMonth) >= 0) {
			accountInfo.balance = accountInfo.openingBalance;
		}
	}

	const transactions: ProjectionTransaction[] = [];
	const events: ProjectionResult['events'] = [];
	const liquidityPoints: ProjectionResult['liquidity']['points'] = [];
	const accountSeries: AccountBalanceSeries[] = input.accounts.map((account) => ({
		accountId: account.id,
		accountName: account.name,
		points: []
	}));
	const assetSeries: AssetValueSeries[] = input.assets
		.filter(
			(asset) =>
				(asset.asset_type === 'property' ||
					asset.asset_type === 'shares' ||
					asset.asset_type === 'superannuation') &&
				asset.id
		)
		.map((asset) => ({
			assetId: asset.id as string,
			assetName:
				asset.name ??
				(asset.asset_type === 'shares'
					? 'Shares'
					: asset.asset_type === 'superannuation'
						? 'Superannuation'
						: 'Property'),
			assetType: asset.asset_type,
			points: []
		}));
	const cashAccountIds = input.accounts
		.filter((account) => account.account_type === 'cash_account')
		.map((account) => account.id);
	const insolventEventAccountIds = new Set<string>();
	const blockedTransferSourceAccountIds = new Set<string>();
	const blockedAutoFundingTargetIds = new Set<string>();
	const blockedAutoSweepSourceIds = new Set<string>();
	const recordedAutoFundingExecutionRuleIds = new Set<string>();
	const recordedAutoSweepExecutionRuleIds = new Set<string>();
	const autoFundingRules = (input.autoFundingRules ?? [])
		.map((rule) => ({
			id: rule.id,
			sourceAccountId: rule.source_account_id,
			targetAccountId: rule.target_account_id,
			priorityOrder:
				typeof rule.priority_order === 'number' && Number.isFinite(rule.priority_order)
					? rule.priority_order
					: Number.MAX_SAFE_INTEGER,
			minTargetBalance:
				typeof rule.min_target_balance === 'number' && Number.isFinite(rule.min_target_balance)
					? rule.min_target_balance
					: 0
		}))
		.sort((a, b) => a.targetAccountId.localeCompare(b.targetAccountId) || a.priorityOrder - b.priorityOrder);
	const accountBalanceTargets = (input.accountBalanceTargets ?? [])
		.map((target) => ({
			accountId: target.account_id,
			minBalance:
				typeof target.min_balance === 'number' && Number.isFinite(target.min_balance)
					? Math.max(0, target.min_balance)
					: 0,
			maxBalance:
				typeof target.max_balance === 'number' && Number.isFinite(target.max_balance)
					? Math.max(0, target.max_balance)
					: null
		}));
	const accountBalanceTargetsByAccountId = new Map(
		accountBalanceTargets.map((target) => [target.accountId, target])
	);
	const autoSweepRules = (input.autoSweepRules ?? [])
		.map((rule) => ({
			id: rule.id,
			sourceAccountId: rule.source_account_id,
			destinationAccountId: rule.destination_account_id,
			priorityOrder:
				typeof rule.priority_order === 'number' && Number.isFinite(rule.priority_order)
					? rule.priority_order
					: Number.MAX_SAFE_INTEGER
		}))
		.sort((a, b) => a.sourceAccountId.localeCompare(b.sourceAccountId) || a.priorityOrder - b.priorityOrder);

	const cashflowMeta = input.cashflows.map((cashflow) => {
		const start = parseYearMonth(cashflow.start_date);
		const end = parseYearMonth(cashflow.end_date ?? undefined);
		const interval = getFrequencyInterval(cashflow.frequency);
		const assetName =
			cashflow.cashflow_type === 'expense'
				? cashflow.source_asset_name ?? null
				: cashflow.cashflow_type === 'income'
					? cashflow.destination_asset_name ?? null
					: null;
		return { cashflow, start, end, interval, assetName };
	});

	const personAssets = new Map<string, { retirementDate: YearMonth; hundredDate: YearMonth }>();
	for (const asset of input.assets) {
		if (asset.asset_type !== 'person') continue;
		const dobValue = asset.details?.dob;
		const retirementAgeValue = asset.details?.retirementAge;
		const dob = parseYearMonth(dobValue);
		const retirementAge =
			typeof retirementAgeValue === 'number'
				? retirementAgeValue
				: typeof retirementAgeValue === 'string'
					? Number(retirementAgeValue)
					: null;
		if (!dob || retirementAge === null || !Number.isFinite(retirementAge)) continue;
		const retirementDate = { year: dob.year + retirementAge, month: dob.month };
		const hundredDate = { year: dob.year + 100, month: dob.month };
		if (asset.id) {
			personAssets.set(asset.id, { retirementDate, hundredDate });
		}
	}

	const propertySaleDates = new Map<string, YearMonth>();
	const propertyNames = new Map<string, string>();
	for (const asset of input.assets) {
		if (asset.asset_type !== 'property') continue;
		if (asset.id) {
			propertyNames.set(asset.id, asset.name ?? 'Property');
		}
		const saleDateValue = asset.details?.saleDate;
		const saleDate = parseYearMonth(saleDateValue);
		if (saleDate && asset.id) {
			propertySaleDates.set(asset.id, saleDate);
		}
	}

	const accountToPerson = new Map<string, { retirementDate: YearMonth; hundredDate: YearMonth }>();
	for (const link of input.assetAccounts) {
		const person = personAssets.get(link.asset_id);
		if (!person) continue;
		if (!accountToPerson.has(link.account_id)) {
			accountToPerson.set(link.account_id, person);
		}
	}

	const accountToPropertySale = new Map<string, YearMonth>();
	for (const link of input.assetAccounts) {
		const saleDate = propertySaleDates.get(link.asset_id);
		if (!saleDate) continue;
		if (!accountToPropertySale.has(link.account_id)) {
			accountToPropertySale.set(link.account_id, saleDate);
		}
	}

	const propertyValuationStates = new Map<
		string,
		{
			accountId: string;
			startDate: YearMonth;
			saleDate: YearMonth | null;
			marketValue: number;
			marketGrowthRate: number;
			fixedSellingCosts: number;
			variableSellingCosts: number;
			assetName: string;
			currentValue: number;
			sold: boolean;
		}
	>();
	const mortgagePaidOffEventAccountIds = new Set<string>();
	const recordMortgagePaidOffEvent = (mortgageAccountId: string, monthLabel: string) => {
		if (mortgagePaidOffEventAccountIds.has(mortgageAccountId)) return;
		const mortgageAccount = accountMap.get(mortgageAccountId);
		if (!mortgageAccount) return;
		events.push({
			tone: 'positive',
			monthLabel,
			message: `Mortgage ${mortgageAccount.name} paid off.`
		});
		mortgagePaidOffEventAccountIds.add(mortgageAccountId);
	};
	for (const asset of input.assets) {
		if (asset.asset_type !== 'property' || !asset.id) continue;
		const saleDateValue = asset.details?.saleDate;
		const startDate = parseYearMonth(asset.start_date);
		const saleDate = parseYearMonth(saleDateValue);
		if (!startDate) continue;
		const marketValue = getNumberDetail(asset.details ?? {}, 'marketValue');
		if (marketValue === null) continue;
		const marketGrowthRate = getNumberDetail(asset.details ?? {}, 'marketGrowthRate') ?? 5;
		const fixedSellingCosts = getNumberDetail(asset.details ?? {}, 'fixedSellingCosts') ?? 10000;
		const variableSellingCosts =
			getNumberDetail(asset.details ?? {}, 'variableSellingCosts') ?? 1.65;

		let accountId: string | null = null;
		for (const link of input.assetAccounts) {
			if (link.asset_id !== asset.id) continue;
			if (link.relationship_role === 'held_in') {
				accountId = link.account_id;
				break;
			}
		}
		if (!accountId) continue;

		propertyValuationStates.set(asset.id, {
			accountId,
			startDate,
			saleDate,
			marketValue,
			marketGrowthRate,
			fixedSellingCosts,
			variableSellingCosts,
			assetName: asset.name ?? 'Property',
			currentValue: marketValue,
			sold: false
		});
	}

	const mortgageStates = new Map<
		string,
		{
			mortgageAccountId: string;
			fundingSourceAccountId: string;
			offsetAccountId: string | null;
			propertySaleDate: YearMonth | null;
			propertyName: string | null;
			termRemainingMonths: number;
			startDate: YearMonth | null;
		}
	>();
	const shareStates = new Map<
		string,
		{
			assetName: string;
			brokerageAccountId: string;
			paysIntoAccountId: string | null;
			startDate: YearMonth | null;
			currentValue: number;
			capitalGrowthRate: number;
			dividendYield: number;
			dividendsTakenAsIncomeDate: YearMonth | null;
		}
	>();
	const superStates = new Map<
		string,
		{
			assetName: string;
			superAccountId: string;
			startDate: YearMonth | null;
			preservationDate: YearMonth | null;
			preservationEventRecorded: boolean;
			blockedWithdrawalEventRecorded: boolean;
			drawdownCycleYear: number | null;
			drawdownMonthsRemaining: number;
			monthlyDrawdownAmount: number;
			paysIntoAccountId: string | null;
			currentValue: number;
			capitalGrowthRate: number;
			managementFeeRate: number;
		}
	>();
	for (const asset of input.assets) {
		if (asset.asset_type !== 'mortgage' || !asset.id) continue;
		const termMonths = getTermMonths(asset.details ?? {});
		const startDate = parseYearMonth(asset.start_date);
		const propertySaleDate =
			asset.property_id && propertySaleDates.has(asset.property_id)
				? propertySaleDates.get(asset.property_id) ?? null
				: null;
		const propertyName = asset.property_id ? propertyNames.get(asset.property_id) ?? null : null;
		let mortgageAccountId: string | null = null;
		let fundingSourceAccountId: string | null = null;
		let offsetAccountId: string | null = null;

		for (const link of input.assetAccounts) {
			if (link.asset_id !== asset.id) continue;
			if (link.relationship_role === 'held_in') {
				mortgageAccountId = link.account_id;
			} else if (link.relationship_role === 'funding_source') {
				fundingSourceAccountId = link.account_id;
			} else if (link.relationship_role === 'offsets') {
				offsetAccountId = link.account_id;
			}
		}

		if (mortgageAccountId && fundingSourceAccountId && termMonths > 0) {
			const mortgageAccountStartDate =
				input.accounts.find((account) => account.id === mortgageAccountId)?.start_date ?? null;
			const accountStartDate = parseYearMonth(mortgageAccountStartDate);
			mortgageStates.set(asset.id, {
				mortgageAccountId,
				fundingSourceAccountId,
				offsetAccountId,
				propertySaleDate,
				propertyName,
				termRemainingMonths: termMonths,
				startDate: startDate ?? accountStartDate
			});
		}
	}
	for (const asset of input.assets) {
		if (asset.asset_type !== 'shares' || !asset.id) continue;
		const details = asset.details ?? {};
		const startDate = parseYearMonth(asset.start_date);
		const dividendsTakenAsIncomeDate = parseYearMonth(details.dividendsTakenAsIncomeDate);
		const capitalGrowthRate = getNumberDetail(details, 'capitalGrowthRate') ?? 0;
		const dividendYield = getNumberDetail(details, 'dividendYield') ?? 0;
		let brokerageAccountId: string | null = null;
		let paysIntoAccountId: string | null = null;
		for (const link of input.assetAccounts) {
			if (link.asset_id !== asset.id) continue;
			if (link.relationship_role === 'held_in') {
				brokerageAccountId = link.account_id;
			}
			if (link.relationship_role === 'pays_into') {
				paysIntoAccountId = link.account_id;
			}
		}
		if (!brokerageAccountId) continue;
		const brokerageOpeningBalance = accountMap.get(brokerageAccountId)?.openingBalance ?? 0;
		shareStates.set(asset.id, {
			assetName: asset.name ?? 'Shares',
			brokerageAccountId,
			paysIntoAccountId,
			startDate,
			currentValue: brokerageOpeningBalance,
			capitalGrowthRate,
			dividendYield,
			dividendsTakenAsIncomeDate
		});
	}
	for (const asset of input.assets) {
		if (asset.asset_type !== 'superannuation' || !asset.id) continue;
		const details = asset.details ?? {};
		const startDate = parseYearMonth(asset.start_date);
		const preservationAge = getNumberDetail(details, 'preservationAge');
		const capitalGrowthRate = getNumberDetail(details, 'capitalGrowthRate') ?? 0;
		const managementFeeRate = getNumberDetail(details, 'managementFeeRate') ?? 0;
		let superAccountId: string | null = null;
		let paysIntoAccountId: string | null = null;
		for (const link of input.assetAccounts) {
			if (link.asset_id !== asset.id) continue;
			if (link.relationship_role === 'held_in') {
				superAccountId = link.account_id;
				break;
			}
		}
		for (const link of input.assetAccounts) {
			if (link.asset_id !== asset.id) continue;
			if (link.relationship_role === 'pays_into') {
				paysIntoAccountId = link.account_id;
				break;
			}
		}
		if (!superAccountId) continue;
		const openingBalance = accountMap.get(superAccountId)?.openingBalance ?? 0;
		const linkedPerson = asset.person_id ? input.assets.find((item) => item.id === asset.person_id) : null;
		const personDob = linkedPerson ? parseYearMonth(linkedPerson.details?.dob) : null;
		const preservationDate =
			personDob && preservationAge !== null && Number.isFinite(preservationAge)
				? { year: personDob.year + preservationAge, month: personDob.month }
				: null;
		superStates.set(asset.id, {
			assetName: asset.name ?? 'Superannuation',
			superAccountId,
			startDate,
			preservationDate,
			preservationEventRecorded: false,
			blockedWithdrawalEventRecorded: false,
			drawdownCycleYear: null,
			drawdownMonthsRemaining: 0,
			monthlyDrawdownAmount: 0,
			paysIntoAccountId,
			currentValue: openingBalance,
			capitalGrowthRate,
			managementFeeRate
		});
	}
	for (const [, shareState] of shareStates) {
		const brokerageAccount = accountMap.get(shareState.brokerageAccountId);
		if (!brokerageAccount) continue;
		brokerageAccount.openingBalance = 0;
		brokerageAccount.balance = 0;
	}
	for (const [, superState] of superStates) {
		const superAccount = accountMap.get(superState.superAccountId);
		if (!superAccount) continue;
		superAccount.openingBalance = 0;
		superAccount.balance = 0;
	}
	const brokerageShareByAccountId = new Map<string, string>();
	for (const [shareAssetId, shareState] of shareStates.entries()) {
		if (!brokerageShareByAccountId.has(shareState.brokerageAccountId)) {
			brokerageShareByAccountId.set(shareState.brokerageAccountId, shareAssetId);
		}
	}
	const superByAccountId = new Map<string, string>();
	for (const [superAssetId, superState] of superStates.entries()) {
		if (!superByAccountId.has(superState.superAccountId)) {
			superByAccountId.set(superState.superAccountId, superAssetId);
		}
	}
	const liquiditySeries: ProjectionResult['liquidity']['series'] = [
		...input.accounts
			.filter((account) => account.account_type === 'cash_account')
			.map((account) => ({
				id: `account:${account.id}`,
				name: account.name,
				points: []
			})),
		...Array.from(shareStates.entries()).map(([assetId, state]) => ({
			id: `asset:${assetId}`,
			name: state.assetName,
			points: []
		})),
		...Array.from(superStates.entries()).map(([assetId, state]) => ({
			id: `asset:${assetId}`,
			name: state.assetName,
			points: []
		}))
	];
	const liquiditySeriesById = new Map(liquiditySeries.map((series) => [series.id, series]));
	let plannerFirstShortfall: ProjectionResult['planner']['firstShortfall'] = null;

	for (let i = 0; i <= totalMonths; i += 1) {
		const current = addMonthsToYearMonth(startYearMonth, i);
		const monthLabel = formatYearMonthLabel(current);
		const currentDate = toYearMonthInt(current);
		const yearDiff = current.year - startYearMonth.year;
		const inflationFactor = Math.pow(1 + inflationRate / 100, yearDiff);

		for (const [, accountInfo] of accountMap) {
			if (!accountInfo.startDate) continue;
			if (monthsBetweenYearMonths(accountInfo.startDate, current) !== 0) continue;
			if (Math.abs(accountInfo.balance) > 0.0000001) continue;
			accountInfo.balance = accountInfo.openingBalance;
		}

		const pushTransaction = (
			accountId: string,
			signedAmount: number,
			cashflowType: ProjectionTransaction['cashflowType'],
			category: ProjectionTransaction['category'],
			cashflowId: string,
			description?: string | null,
			assetName?: string | null
		) => {
			const accountInfo = accountMap.get(accountId);
			if (!accountInfo) return;
			if (accountInfo.startDate && monthsBetweenYearMonths(accountInfo.startDate, current) < 0) return;
			accountInfo.balance += signedAmount;
			transactions.push({
				cashflowId,
				cashflowType,
				category,
				assetName: assetName ?? null,
				description: description ?? null,
				accountId,
				accountName: accountInfo.name,
				amount: signedAmount,
				date: currentDate,
				monthLabel
			});
		};

		const recordBlockedTransferEvent = (
			sourceAccountId: string,
			sourceAccountName: string,
			destinationAccountName: string,
			requestedAmount: number,
			availableAmount: number,
			description?: string | null
		) => {
			if (blockedTransferSourceAccountIds.has(sourceAccountId)) return;
			const descriptionSuffix =
				description && description.trim().length > 0 ? ` (${description.trim()})` : '';
			events.push({
				tone: 'negative',
				monthLabel,
				message: `Transfer from ${sourceAccountName} to ${destinationAccountName}${descriptionSuffix} skipped: requested ${requestedAmount.toFixed(2)} but only ${availableAmount.toFixed(2)} available.`
			});
			blockedTransferSourceAccountIds.add(sourceAccountId);
		};

		for (const meta of cashflowMeta) {
			const { cashflow, start, end, interval, assetName } = meta;
			if (!start) continue;
			const monthDiff = monthsBetweenYearMonths(start, current);
			if (monthDiff < 0) continue;
			if (end) {
				const endDiff = monthsBetweenYearMonths(start, end);
				if (endDiff < 0) continue;
				if (monthDiff > endDiff) continue;
			}

			if (interval === 0) {
				if (monthDiff !== 0) continue;
			} else if (monthDiff % interval !== 0) {
				continue;
			}

			const cashflowAccountId =
				cashflow.destination_account_id ?? cashflow.source_account_id ?? null;
			if (cashflowAccountId) {
				const person = accountToPerson.get(cashflowAccountId);
				if (person) {
					const startIndex = yearMonthIndex(start);
					const currentIndex = yearMonthIndex(current);
					if (cashflow.category === 'employment_income') {
						const retirementIndex = yearMonthIndex(person.retirementDate);
						if (startIndex <= retirementIndex && currentIndex >= retirementIndex) {
							continue;
						}
					}
					if (cashflow.category === 'living_expenses') {
						const hundredIndex = yearMonthIndex(person.hundredDate);
						if (startIndex <= hundredIndex && currentIndex >= hundredIndex) {
							continue;
						}
					}
				}

				const propertySaleDate = accountToPropertySale.get(cashflowAccountId);
				if (propertySaleDate && cashflow.category === 'asset_ownership') {
					const startIndex = yearMonthIndex(start);
					const currentIndex = yearMonthIndex(current);
					const saleIndex = yearMonthIndex(propertySaleDate);
					if (startIndex <= saleIndex && currentIndex >= saleIndex) {
						continue;
					}
				}
			}

			const baseAmount = Number(cashflow.amount);
			if (!Number.isFinite(baseAmount)) {
				continue;
			}
			const rawAmount = cashflow.inflation_affected
				? baseAmount * inflationFactor
				: baseAmount;

			if (cashflow.cashflow_type === 'income') {
				if (cashflow.destination_account_id) {
					pushTransaction(
						cashflow.destination_account_id,
						rawAmount,
						cashflow.cashflow_type,
						cashflow.category,
						cashflow.id,
						cashflow.description ?? null,
						assetName
					);
				}
			} else if (cashflow.cashflow_type === 'expense') {
				if (cashflow.source_account_id) {
					pushTransaction(
						cashflow.source_account_id,
						-rawAmount,
						cashflow.cashflow_type,
						cashflow.category,
						cashflow.id,
						cashflow.description ?? null,
						assetName
					);
				}
			} else {
				const sourceId = cashflow.source_account_id;
				const destinationId = cashflow.destination_account_id;
				const sourceAccount = sourceId ? accountMap.get(sourceId) : null;
				const destinationAccount = destinationId ? accountMap.get(destinationId) : null;
				const destinationShareAssetId = destinationId
					? brokerageShareByAccountId.get(destinationId) ?? null
					: null;
				const sourceShareAssetId = sourceId ? brokerageShareByAccountId.get(sourceId) ?? null : null;
				const destinationSuperAssetId = destinationId
					? superByAccountId.get(destinationId) ?? null
					: null;
				const sourceSuperAssetId = sourceId ? superByAccountId.get(sourceId) ?? null : null;

				const isShareBuyTransfer =
					sourceId &&
					destinationId &&
					sourceAccount?.type === 'cash_account' &&
					destinationAccount?.type === 'brokerage' &&
					destinationShareAssetId !== null;
				const isShareSellTransfer =
					sourceId &&
					destinationId &&
					sourceAccount?.type === 'brokerage' &&
					destinationAccount?.type === 'cash_account' &&
					sourceShareAssetId !== null;
				const isSuperContributionTransfer =
					sourceId &&
					destinationId &&
					sourceAccount?.type === 'cash_account' &&
					destinationAccount?.type === 'super_account' &&
					destinationSuperAssetId !== null;
				const isSuperWithdrawalTransfer =
					sourceId &&
					destinationId &&
					sourceAccount?.type === 'super_account' &&
					destinationAccount?.type === 'cash_account' &&
					sourceSuperAssetId !== null;
				const sourceAccountName = sourceAccount?.name ?? 'source account';
				const destinationAccountName = destinationAccount?.name ?? 'destination account';

				if (isShareBuyTransfer && sourceId && destinationId && destinationShareAssetId) {
					const shareState = shareStates.get(destinationShareAssetId);
					const shareAssetName = shareState?.assetName ?? null;
					pushTransaction(
						sourceId,
						-rawAmount,
						cashflow.cashflow_type,
						'shares_purchase',
						cashflow.id,
						cashflow.description ?? null,
						shareAssetName
					);
					pushTransaction(
						destinationId,
						rawAmount,
						cashflow.cashflow_type,
						'shares_purchase',
						cashflow.id,
						cashflow.description ?? null,
						shareAssetName
					);
					const brokerageAccount = accountMap.get(destinationId);
					if (brokerageAccount) {
						// Brokerage is a routing link account in projection; buys become asset value directly.
						brokerageAccount.balance -= rawAmount;
					}
					if (shareState) {
						shareState.currentValue += rawAmount;
					}
					continue;
				}

				if (isShareSellTransfer && sourceId && destinationId && sourceShareAssetId) {
					const shareState = shareStates.get(sourceShareAssetId);
					if (!shareState) continue;
					const shareAssetName = shareState.assetName ?? null;
					const availableAmount = Math.max(0, shareState.currentValue);
					if (rawAmount > availableAmount) {
						recordBlockedTransferEvent(
							sourceId,
							sourceAccountName,
							destinationAccountName,
							rawAmount,
							availableAmount,
							cashflow.description ?? null
						);
						continue;
					}
					const tradeAmount = rawAmount;
					if (tradeAmount <= 0) continue;

					pushTransaction(
						sourceId,
						-tradeAmount,
						cashflow.cashflow_type,
						'shares_sale',
						cashflow.id,
						cashflow.description ?? null,
						shareAssetName
					);
					pushTransaction(
						destinationId,
						tradeAmount,
						cashflow.cashflow_type,
						'shares_sale',
						cashflow.id,
						cashflow.description ?? null,
						shareAssetName
					);
					const brokerageAccount = accountMap.get(sourceId);
					if (brokerageAccount) {
						// Brokerage is a routing link account in projection; sells come from asset value.
						brokerageAccount.balance += tradeAmount;
					}
					shareState.currentValue -= tradeAmount;
					continue;
				}

				if (isSuperContributionTransfer && sourceId && destinationId && destinationSuperAssetId) {
					const superState = superStates.get(destinationSuperAssetId);
					const superAssetName = superState?.assetName ?? null;
					pushTransaction(
						sourceId,
						-rawAmount,
						cashflow.cashflow_type,
						'transfer',
						cashflow.id,
						cashflow.description ?? null,
						superAssetName
					);
					pushTransaction(
						destinationId,
						rawAmount,
						cashflow.cashflow_type,
						'transfer',
						cashflow.id,
						cashflow.description ?? null,
						superAssetName
					);
					const superAccount = accountMap.get(destinationId);
					if (superAccount) {
						superAccount.balance -= rawAmount;
					}
					if (superState) {
						superState.currentValue += rawAmount;
					}
					continue;
				}

				if (isSuperWithdrawalTransfer && sourceId && destinationId && sourceSuperAssetId) {
					const superState = superStates.get(sourceSuperAssetId);
					if (!superState) continue;
					const preservationReached =
						!superState.preservationDate ||
						monthsBetweenYearMonths(superState.preservationDate, current) >= 0;
					if (!preservationReached) {
						if (!superState.blockedWithdrawalEventRecorded) {
							events.push({
								tone: 'negative',
								monthLabel,
								message: `Super ${superState.assetName} transfer blocked before preservation age.`
							});
							superState.blockedWithdrawalEventRecorded = true;
						}
						continue;
					}

					const superAssetName = superState.assetName ?? null;
					const availableAmount = Math.max(0, superState.currentValue);
					if (rawAmount > availableAmount) {
						recordBlockedTransferEvent(
							sourceId,
							sourceAccountName,
							destinationAccountName,
							rawAmount,
							availableAmount,
							cashflow.description ?? null
						);
						continue;
					}
					const tradeAmount = rawAmount;
					if (tradeAmount <= 0) continue;
					pushTransaction(
						sourceId,
						-tradeAmount,
						cashflow.cashflow_type,
						'transfer',
						cashflow.id,
						cashflow.description ?? null,
						superAssetName
					);
					pushTransaction(
						destinationId,
						tradeAmount,
						cashflow.cashflow_type,
						'transfer',
						cashflow.id,
						cashflow.description ?? null,
						superAssetName
					);
					const superAccount = accountMap.get(sourceId);
					if (superAccount) {
						superAccount.balance += tradeAmount;
					}
					superState.currentValue -= tradeAmount;
					continue;
				}

				if (sourceId) {
					pushTransaction(
						sourceId,
						-rawAmount,
						cashflow.cashflow_type,
						cashflow.category,
						cashflow.id,
						cashflow.description ?? null,
						assetName
					);
				}
				if (destinationId) {
					pushTransaction(
						destinationId,
						rawAmount,
						cashflow.cashflow_type,
						cashflow.category,
						cashflow.id,
						cashflow.description ?? null,
						assetName
					);
				}
			}
		}

		for (const [assetId, state] of shareStates.entries()) {
			if (state.startDate && monthsBetweenYearMonths(state.startDate, current) < 0) continue;
			if (!Number.isFinite(state.currentValue) || state.currentValue === 0) continue;

			const capitalMonthlyRate = state.capitalGrowthRate / 100 / 12;
			const dividendMonthlyRate = state.dividendYield / 100 / 12;
			const capitalGrowthAmount = state.currentValue * capitalMonthlyRate;
			const hasDividendIncomeDate =
				state.dividendsTakenAsIncomeDate !== null &&
				Number.isFinite(yearMonthIndex(state.dividendsTakenAsIncomeDate));
			const reachedDividendIncomeDate =
				hasDividendIncomeDate &&
				monthsBetweenYearMonths(state.dividendsTakenAsIncomeDate as YearMonth, current) >= 0;

			if (!hasDividendIncomeDate || !reachedDividendIncomeDate) {
				const combinedGrowthAmount = state.currentValue * (capitalMonthlyRate + dividendMonthlyRate);
				state.currentValue += combinedGrowthAmount;
				continue;
			}

			state.currentValue += capitalGrowthAmount;

			const monthDiff = monthsBetweenYearMonths(
				state.dividendsTakenAsIncomeDate as YearMonth,
				current
			);
			if (monthDiff < 0 || monthDiff % 3 !== 0) continue;
			if (!state.paysIntoAccountId) continue;

			const quarterlyDividendAmount = state.currentValue * (state.dividendYield / 100 / 4);
			if (quarterlyDividendAmount === 0) continue;
			pushTransaction(
				state.brokerageAccountId,
				quarterlyDividendAmount,
				'income',
				'dividend_income',
				`shares_dividend_${assetId}`,
				null,
				state.assetName
			);
			if (!state.paysIntoAccountId) continue;
			pushTransaction(
				state.brokerageAccountId,
				-quarterlyDividendAmount,
				'transfer',
				'transfer',
				`shares_dividend_transfer_out_${assetId}`,
				null,
				state.assetName
			);
			pushTransaction(
				state.paysIntoAccountId,
				quarterlyDividendAmount,
				'transfer',
				'transfer',
				`shares_dividend_transfer_in_${assetId}`,
				null,
				state.assetName
			);
		}

		for (const [assetId, state] of superStates.entries()) {
			if (state.startDate && monthsBetweenYearMonths(state.startDate, current) < 0) continue;
			if (state.preservationDate && !state.preservationEventRecorded) {
				const preservationIndex = yearMonthIndex(state.preservationDate);
				const currentIndex = yearMonthIndex(current);
				if (currentIndex >= preservationIndex) {
					events.push({
						tone: 'positive',
						monthLabel,
						message: `Super ${state.assetName} reaches preservation age.`
					});
					state.preservationEventRecorded = true;
				}
			}

			const preservationReached =
				!state.preservationDate || monthsBetweenYearMonths(state.preservationDate, current) >= 0;
			if (preservationReached && current.month === 7 && state.drawdownCycleYear !== current.year) {
				state.drawdownCycleYear = current.year;
				state.drawdownMonthsRemaining = 12;
				state.monthlyDrawdownAmount = (state.currentValue * 0.04) / 12;
			}

			if (preservationReached && state.drawdownMonthsRemaining > 0 && state.monthlyDrawdownAmount > 0) {
				const drawdownAmount = Math.min(state.currentValue, state.monthlyDrawdownAmount);
				if (drawdownAmount > 0) {
					pushTransaction(
						state.superAccountId,
						drawdownAmount,
						'income',
						'super_income',
						`super_drawdown_${assetId}_${state.drawdownCycleYear ?? current.year}`,
						'Mandatory 4% drawdown',
						state.assetName
					);
					if (state.paysIntoAccountId) {
						pushTransaction(
							state.superAccountId,
							-drawdownAmount,
							'transfer',
							'transfer',
							`super_drawdown_transfer_out_${assetId}_${state.drawdownCycleYear ?? current.year}`,
							null,
							state.assetName
						);
						pushTransaction(
							state.paysIntoAccountId,
							drawdownAmount,
							'transfer',
							'transfer',
							`super_drawdown_transfer_in_${assetId}_${state.drawdownCycleYear ?? current.year}`,
							null,
							state.assetName
						);
					}
					state.currentValue -= drawdownAmount;
				}
				state.drawdownMonthsRemaining -= 1;
			}

			if (!Number.isFinite(state.currentValue) || state.currentValue === 0) continue;
			const netAnnualRate = state.capitalGrowthRate - state.managementFeeRate;
			const monthlyRate = netAnnualRate / 100 / 12;
			const netGrowthAmount = state.currentValue * monthlyRate;
			if (!Number.isFinite(netGrowthAmount) || netGrowthAmount === 0) continue;
			state.currentValue += netGrowthAmount;
		}

		for (const [assetId, property] of propertyValuationStates.entries()) {
			if (property.sold) continue;
			const monthsHeld = monthsBetweenYearMonths(property.startDate, current);
			if (monthsHeld < 0) continue;

			const yearsHeld = (monthsHeld + 1) / 12;
			const growthFactor = Math.pow(1 + property.marketGrowthRate / 100, yearsHeld);
			const targetMarketValue = property.marketValue * growthFactor;
			if (!Number.isFinite(targetMarketValue)) continue;
			property.currentValue = targetMarketValue;

			if (!property.saleDate) continue;
			const currentIndex = yearMonthIndex(current);
			const saleIndex = yearMonthIndex(property.saleDate);
			if (currentIndex !== saleIndex) continue;

			const saleAmount = targetMarketValue;
			if (saleAmount > 0) {
				pushTransaction(
					property.accountId,
					saleAmount,
					'income',
					'asset_sale',
					`property_sale_${assetId}`,
					'Asset sale',
					property.assetName
				);
			}
			events.push({
				tone: 'positive',
				monthLabel,
				message: `${property.assetName} sold for ${formatEventCurrency(saleAmount)}.`
			});

			const saleInflationFactor = Math.pow(1 + inflationRate / 100, yearsHeld);
			const inflatedFixedCosts = property.fixedSellingCosts * saleInflationFactor;
			const variableCosts = (property.variableSellingCosts / 100) * saleAmount;
			const totalFixedCosts = inflatedFixedCosts > 0 ? inflatedFixedCosts : 0;
			const totalVariableCosts = variableCosts > 0 ? variableCosts : 0;

			if (totalFixedCosts > 0) {
				pushTransaction(
					property.accountId,
					-totalFixedCosts,
					'expense',
					'asset_ownership',
					`property_sale_fixed_${assetId}`,
					'Fixed selling costs',
					property.assetName
				);
			}

			if (totalVariableCosts > 0) {
				pushTransaction(
					property.accountId,
					-totalVariableCosts,
					'expense',
					'asset_ownership',
					`property_sale_variable_${assetId}`,
					'Variable selling costs',
					property.assetName
				);
			}

			property.currentValue = 0;
			property.sold = true;
		}

		for (const [assetId, state] of mortgageStates.entries()) {
			if (state.termRemainingMonths <= 0) continue;
			if (state.startDate && monthsBetweenYearMonths(state.startDate, current) < 0) {
				continue;
			}

			const mortgageAccount = accountMap.get(state.mortgageAccountId);
			if (!mortgageAccount) continue;
			const principal = Math.abs(mortgageAccount.balance);
			if (principal === 0) {
				recordMortgagePaidOffEvent(state.mortgageAccountId, monthLabel);
				state.termRemainingMonths -= 1;
				continue;
			}

			if (state.propertySaleDate) {
				const saleIndex = yearMonthIndex(state.propertySaleDate);
				const currentIndex = yearMonthIndex(current);
				if (currentIndex === saleIndex) {
					pushTransaction(
						state.fundingSourceAccountId,
						-principal,
						'transfer',
						'mortgage_repayment',
						`mortgage_payoff_${assetId}`,
						'Mortgage payoff',
						state.propertyName
					);
					pushTransaction(
						state.mortgageAccountId,
						principal,
						'transfer',
						'mortgage_repayment',
						`mortgage_payoff_${assetId}`,
						'Mortgage payoff',
						state.propertyName
					);
					recordMortgagePaidOffEvent(state.mortgageAccountId, monthLabel);
					state.termRemainingMonths = 0;
					continue;
				}
			}

			const offsetBalance =
				state.offsetAccountId && accountMap.has(state.offsetAccountId)
					? Math.max(0, accountMap.get(state.offsetAccountId)?.balance ?? 0)
					: 0;
			const interestPrincipal = Math.max(0, principal - offsetBalance);

			const baseRate =
				typeof mortgageAccount.interestRate === 'number' &&
				Number.isFinite(mortgageAccount.interestRate)
					? mortgageAccount.interestRate
					: 0;
			const monthlyRate = baseRate / 100 / 12;
			const remaining = state.termRemainingMonths;
			const scheduledPayment =
				monthlyRate === 0
					? principal / remaining
					: (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remaining));
			const interestAmount = interestPrincipal * monthlyRate;
			// Do not allow mortgage balance to cross above zero due to an oversized final payment.
			const payment = Math.min(scheduledPayment, principal + Math.max(interestAmount, 0));

			if (payment > 0) {
				pushTransaction(
					state.fundingSourceAccountId,
					-payment,
					'transfer',
					'mortgage_repayment',
					`mortgage_payment_${assetId}`,
					null,
					state.propertyName
				);
				pushTransaction(
					state.mortgageAccountId,
					payment,
					'transfer',
					'mortgage_repayment',
					`mortgage_payment_${assetId}`,
					null,
					state.propertyName
				);
			}

			if (interestAmount > 0) {
				pushTransaction(
					state.mortgageAccountId,
					-interestAmount,
					'expense',
					'interest',
					`mortgage_interest_${assetId}`,
					null,
					state.propertyName
				);
			}

			if (Math.abs(mortgageAccount.balance) <= 0.01) {
				recordMortgagePaidOffEvent(state.mortgageAccountId, monthLabel);
			}

			state.termRemainingMonths -= 1;
		}

		for (const [accountId, accountInfo] of accountMap.entries()) {
			if (accountInfo.type !== 'cash_account') {
				continue;
			}
			if (accountInfo.startDate && monthsBetweenYearMonths(accountInfo.startDate, current) < 0) {
				continue;
			}

			if (accountInfo.balance <= 0) {
				continue;
			}

			const baseRate =
				typeof accountInfo.interestRate === 'number' && Number.isFinite(accountInfo.interestRate)
					? accountInfo.interestRate
					: 0;
			if (baseRate === 0) {
				continue;
			}
			const monthlyRate = baseRate / 100 / 12;
			const interestAmount = accountInfo.balance * monthlyRate;
			if (interestAmount === 0) continue;

			accountInfo.balance += interestAmount;
			transactions.push({
				cashflowId: 'interest',
				cashflowType: 'income',
				category: 'interest',
				accountId,
				accountName: accountInfo.name,
				amount: interestAmount,
				date: currentDate,
				monthLabel
			});
		}

		const autoFundingRulesByTarget = new Map<string, typeof autoFundingRules>();
		for (const rule of autoFundingRules) {
			const existing = autoFundingRulesByTarget.get(rule.targetAccountId) ?? [];
			autoFundingRulesByTarget.set(rule.targetAccountId, [...existing, rule]);
		}
		for (const [targetAccountId, rules] of autoFundingRulesByTarget.entries()) {
			const targetAccount = accountMap.get(targetAccountId);
			if (!targetAccount) continue;
			if (
				targetAccount.startDate &&
				monthsBetweenYearMonths(targetAccount.startDate, current) < 0
			) {
				continue;
			}
			const targetBalanceSettings = accountBalanceTargetsByAccountId.get(targetAccountId);
			const minTargetBalance = Math.max(
				targetBalanceSettings?.minBalance ?? 0,
				...rules.map((rule) => (Number.isFinite(rule.minTargetBalance) ? rule.minTargetBalance : 0))
			);
			let remainingRequired = minTargetBalance - targetAccount.balance;
			if (!Number.isFinite(remainingRequired) || remainingRequired <= 0) continue;

			for (const rule of rules) {
				if (remainingRequired <= 0) break;
				const sourceAccount = accountMap.get(rule.sourceAccountId);
				if (!sourceAccount) continue;
				if (
					sourceAccount.startDate &&
					monthsBetweenYearMonths(sourceAccount.startDate, current) < 0
				) {
					continue;
				}
				let availableAmount = 0;
				if (sourceAccount.type === 'cash_account') {
					availableAmount = Math.max(0, sourceAccount.balance);
				} else if (sourceAccount.type === 'brokerage') {
					const shareAssetId = brokerageShareByAccountId.get(rule.sourceAccountId);
					const shareState = shareAssetId ? shareStates.get(shareAssetId) : null;
					availableAmount = Math.max(0, shareState?.currentValue ?? 0);
				} else if (sourceAccount.type === 'super_account') {
					const superAssetId = superByAccountId.get(rule.sourceAccountId);
					const superState = superAssetId ? superStates.get(superAssetId) : null;
					const preservationReached =
						superState &&
						(!superState.preservationDate ||
							monthsBetweenYearMonths(superState.preservationDate, current) >= 0);
					availableAmount = preservationReached ? Math.max(0, superState?.currentValue ?? 0) : 0;
				}
				if (availableAmount <= 0) continue;
				const transferAmount = Math.min(remainingRequired, availableAmount);
				pushTransaction(
					rule.sourceAccountId,
					-transferAmount,
					'transfer',
					'transfer',
					`auto_funding:${rule.id}`,
					'Auto-funding transfer'
				);
				pushTransaction(
					targetAccountId,
					transferAmount,
					'transfer',
					'transfer',
					`auto_funding:${rule.id}`,
					'Auto-funding transfer'
				);
				if (sourceAccount.type === 'brokerage') {
					const shareAssetId = brokerageShareByAccountId.get(rule.sourceAccountId);
					const shareState = shareAssetId ? shareStates.get(shareAssetId) : null;
					const brokerageAccount = accountMap.get(rule.sourceAccountId);
					if (brokerageAccount) {
						brokerageAccount.balance += transferAmount;
					}
					if (shareState) {
						shareState.currentValue = Math.max(0, shareState.currentValue - transferAmount);
					}
				}
				if (sourceAccount.type === 'super_account') {
					const superAssetId = superByAccountId.get(rule.sourceAccountId);
					const superState = superAssetId ? superStates.get(superAssetId) : null;
					const superAccount = accountMap.get(rule.sourceAccountId);
					if (superAccount) {
						superAccount.balance += transferAmount;
					}
					if (superState) {
						superState.currentValue = Math.max(0, superState.currentValue - transferAmount);
					}
				}
				if (!recordedAutoFundingExecutionRuleIds.has(rule.id)) {
					const reserveReason =
						minTargetBalance > 0
							? `reserve target ${formatEventCurrency(minTargetBalance)} was breached`
							: 'balance fell below $0';
					events.push({
						tone: 'positive',
						monthLabel,
						message: `Auto-funding applied: ${formatEventCurrency(transferAmount)} moved from ${sourceAccount.name} to ${targetAccount.name} because ${reserveReason}.`
					});
					recordedAutoFundingExecutionRuleIds.add(rule.id);
				}
				remainingRequired -= transferAmount;
			}

			if (remainingRequired > 0.0000001 && !blockedAutoFundingTargetIds.has(targetAccountId)) {
				events.push({
					tone: 'negative',
					monthLabel,
					message: `Auto-funding to ${targetAccount.name} was short: still needed ${formatEventCurrency(remainingRequired)} after all funding accounts were tried.`
				});
				blockedAutoFundingTargetIds.add(targetAccountId);
			}
		}

		const autoSweepRulesBySource = new Map<string, typeof autoSweepRules>();
		for (const rule of autoSweepRules) {
			const existing = autoSweepRulesBySource.get(rule.sourceAccountId) ?? [];
			autoSweepRulesBySource.set(rule.sourceAccountId, [...existing, rule]);
		}
		for (const [sourceAccountId, rules] of autoSweepRulesBySource.entries()) {
			const sourceAccount = accountMap.get(sourceAccountId);
			if (!sourceAccount) continue;
			if (
				sourceAccount.startDate &&
				monthsBetweenYearMonths(sourceAccount.startDate, current) < 0
			) {
				continue;
			}

			const sourceBalanceSettings = accountBalanceTargetsByAccountId.get(sourceAccountId);
			const maxSourceBalance = sourceBalanceSettings?.maxBalance ?? null;
			if (maxSourceBalance === null) continue;
			let remainingExcess = sourceAccount.balance - maxSourceBalance;
			if (!Number.isFinite(remainingExcess) || remainingExcess <= 0) continue;

			for (const rule of rules) {
				if (remainingExcess <= 0) break;
				const destinationAccount = accountMap.get(rule.destinationAccountId);
				if (!destinationAccount) continue;
				if (
					destinationAccount.startDate &&
					monthsBetweenYearMonths(destinationAccount.startDate, current) < 0
				) {
					continue;
				}

				const destinationBalanceSettings = accountBalanceTargetsByAccountId.get(rule.destinationAccountId);
				const maxDestinationBalance = destinationBalanceSettings?.maxBalance ?? null;
				const destinationCapacity =
					maxDestinationBalance === null
						? Number.POSITIVE_INFINITY
						: maxDestinationBalance - destinationAccount.balance;
				if (destinationCapacity <= 0) continue;

				let availableAmount = 0;
				if (sourceAccount.type === 'cash_account') {
					availableAmount = Math.max(0, sourceAccount.balance);
				} else if (sourceAccount.type === 'brokerage') {
					const shareAssetId = brokerageShareByAccountId.get(sourceAccountId);
					const shareState = shareAssetId ? shareStates.get(shareAssetId) : null;
					availableAmount = Math.max(0, shareState?.currentValue ?? 0);
				} else if (sourceAccount.type === 'super_account') {
					const superAssetId = superByAccountId.get(sourceAccountId);
					const superState = superAssetId ? superStates.get(superAssetId) : null;
					const preservationReached =
						superState &&
						(!superState.preservationDate ||
							monthsBetweenYearMonths(superState.preservationDate, current) >= 0);
					availableAmount = preservationReached ? Math.max(0, superState?.currentValue ?? 0) : 0;
				}
				if (availableAmount <= 0) continue;
				const transferAmount = Math.min(remainingExcess, availableAmount, destinationCapacity);
				if (transferAmount <= 0) continue;

				pushTransaction(
					sourceAccountId,
					-transferAmount,
					'transfer',
					'transfer',
					`auto_sweep:${rule.id}`,
					'Auto-sweep transfer'
				);
				pushTransaction(
					rule.destinationAccountId,
					transferAmount,
					'transfer',
					'transfer',
					`auto_sweep:${rule.id}`,
					'Auto-sweep transfer'
				);

				if (sourceAccount.type === 'brokerage') {
					const shareAssetId = brokerageShareByAccountId.get(sourceAccountId);
					const shareState = shareAssetId ? shareStates.get(shareAssetId) : null;
					const brokerageAccount = accountMap.get(sourceAccountId);
					if (brokerageAccount) {
						brokerageAccount.balance += transferAmount;
					}
					if (shareState) {
						shareState.currentValue = Math.max(0, shareState.currentValue - transferAmount);
					}
				}
				if (sourceAccount.type === 'super_account') {
					const superAssetId = superByAccountId.get(sourceAccountId);
					const superState = superAssetId ? superStates.get(superAssetId) : null;
					const superAccount = accountMap.get(sourceAccountId);
					if (superAccount) {
						superAccount.balance += transferAmount;
					}
					if (superState) {
						superState.currentValue = Math.max(0, superState.currentValue - transferAmount);
					}
				}

				const destinationAccountType = destinationAccount.type;
				if (destinationAccountType === 'brokerage') {
					const shareAssetId = brokerageShareByAccountId.get(rule.destinationAccountId);
					const shareState = shareAssetId ? shareStates.get(shareAssetId) : null;
					const brokerageAccount = accountMap.get(rule.destinationAccountId);
					if (brokerageAccount) {
						brokerageAccount.balance -= transferAmount;
					}
					if (shareState) {
						shareState.currentValue += transferAmount;
					}
				}
				if (destinationAccountType === 'super_account') {
					const superAssetId = superByAccountId.get(rule.destinationAccountId);
					const superState = superAssetId ? superStates.get(superAssetId) : null;
					const superAccount = accountMap.get(rule.destinationAccountId);
					if (superAccount) {
						superAccount.balance -= transferAmount;
					}
					if (superState) {
						superState.currentValue += transferAmount;
					}
				}
				if (!recordedAutoSweepExecutionRuleIds.has(rule.id)) {
					events.push({
						tone: 'positive',
						monthLabel,
						message: `Auto-sweep applied: ${formatEventCurrency(transferAmount)} moved from ${sourceAccount.name} to ${destinationAccount.name} because cap ${formatEventCurrency(maxSourceBalance)} was exceeded.`
					});
					recordedAutoSweepExecutionRuleIds.add(rule.id);
				}

				remainingExcess -= transferAmount;
			}

			if (remainingExcess > 0.0000001 && !blockedAutoSweepSourceIds.has(sourceAccountId)) {
				events.push({
					tone: 'negative',
					monthLabel,
					message: `Auto-sweep from ${sourceAccount.name} was short: excess ${formatEventCurrency(remainingExcess)} could not be moved.`
				});
				blockedAutoSweepSourceIds.add(sourceAccountId);
			}
		}

		for (const series of accountSeries) {
			const accountInfo = accountMap.get(series.accountId);
			series.points.push({
				date: currentDate,
				monthLabel,
				balance:
					accountInfo &&
					(!accountInfo.startDate || monthsBetweenYearMonths(accountInfo.startDate, current) >= 0)
						? accountInfo.balance
						: 0
			});
		}
		for (const series of assetSeries) {
			if (series.assetType === 'property') {
				const propertyState = propertyValuationStates.get(series.assetId);
				if (!propertyState) {
					series.points.push({ date: currentDate, monthLabel, value: 0 });
					continue;
				}
				const started = monthsBetweenYearMonths(propertyState.startDate, current) >= 0;
				series.points.push({
					date: currentDate,
					monthLabel,
					value: started ? propertyState.currentValue : 0
				});
				continue;
			}

			if (series.assetType === 'shares') {
				const shareState = shareStates.get(series.assetId);
				if (!shareState) {
					series.points.push({ date: currentDate, monthLabel, value: 0 });
					continue;
				}
				const started =
					!shareState.startDate || monthsBetweenYearMonths(shareState.startDate, current) >= 0;
				series.points.push({
					date: currentDate,
					monthLabel,
					value: started ? shareState.currentValue : 0
				});
				continue;
			}

			if (series.assetType === 'superannuation') {
				const superState = superStates.get(series.assetId);
				if (!superState) {
					series.points.push({ date: currentDate, monthLabel, value: 0 });
					continue;
				}
				const started =
					!superState.startDate || monthsBetweenYearMonths(superState.startDate, current) >= 0;
				series.points.push({
					date: currentDate,
					monthLabel,
					value: started ? superState.currentValue : 0
				});
				continue;
			}

			series.points.push({ date: currentDate, monthLabel, value: 0 });
		}

		let cashLiquidity = 0;
		for (const [accountId, accountInfo] of accountMap.entries()) {
			if (accountInfo.type !== 'cash_account') continue;
			const started =
				!accountInfo.startDate || monthsBetweenYearMonths(accountInfo.startDate, current) >= 0;
			const value = started ? accountInfo.balance : 0;
			cashLiquidity += value;
			liquiditySeriesById.get(`account:${accountId}`)?.points.push({
				date: currentDate,
				monthLabel,
				balance: value
			});
		}
		let sharesLiquidity = 0;
		for (const [assetId, shareState] of shareStates.entries()) {
			const started =
				!shareState.startDate || monthsBetweenYearMonths(shareState.startDate, current) >= 0;
			const value = started ? shareState.currentValue : 0;
			sharesLiquidity += value;
			liquiditySeriesById.get(`asset:${assetId}`)?.points.push({
				date: currentDate,
				monthLabel,
				balance: value
			});
		}
		let superLiquidity = 0;
		for (const [assetId, superState] of superStates.entries()) {
			const started =
				!superState.startDate || monthsBetweenYearMonths(superState.startDate, current) >= 0;
			const preservationReached =
				!superState.preservationDate ||
				monthsBetweenYearMonths(superState.preservationDate, current) >= 0;
			const value = started && preservationReached ? superState.currentValue : 0;
			superLiquidity += value;
			liquiditySeriesById.get(`asset:${assetId}`)?.points.push({
				date: currentDate,
				monthLabel,
				balance: value
			});
		}
		liquidityPoints.push({
			date: currentDate,
			monthLabel,
			balance: cashLiquidity + sharesLiquidity + superLiquidity
		});

		for (const accountId of cashAccountIds) {
			if (insolventEventAccountIds.has(accountId)) continue;
			const accountInfo = accountMap.get(accountId);
			if (!accountInfo) continue;
			if (accountInfo.startDate && monthsBetweenYearMonths(accountInfo.startDate, current) < 0) continue;
			const targetBalanceSettings = accountBalanceTargetsByAccountId.get(accountId);
			const minBalance = targetBalanceSettings?.minBalance ?? 0;
			if (accountInfo.balance < minBalance) {
				if (!plannerFirstShortfall) {
					const availableSourceAccounts: {
						accountId: string;
						accountName: string;
						availableNow: boolean;
						availableFromDate: number | null;
					}[] = [];
					for (const [candidateId, candidateAccount] of accountMap.entries()) {
						if (candidateId === accountId) continue;
						const accountStarted =
							!candidateAccount.startDate ||
							monthsBetweenYearMonths(candidateAccount.startDate, current) >= 0;
						let availableNow = false;
						let availableFrom: YearMonth | null = candidateAccount.startDate ?? null;

						if (candidateAccount.type === 'cash_account') {
							availableNow = accountStarted && candidateAccount.balance > 0;
							availableSourceAccounts.push({
								accountId: candidateId,
								accountName: candidateAccount.name,
								availableNow,
								availableFromDate: availableFrom ? toYearMonthInt(availableFrom) : null
							});
							continue;
						}
						if (candidateAccount.type === 'brokerage') {
							const shareAssetId = brokerageShareByAccountId.get(candidateId);
							const shareState = shareAssetId ? shareStates.get(shareAssetId) : null;
							if (!shareState) continue;
							availableFrom = maxYearMonth(availableFrom, shareState.startDate);
							const shareStarted =
								!shareState.startDate || monthsBetweenYearMonths(shareState.startDate, current) >= 0;
							availableNow =
								accountStarted && shareStarted && (shareState.currentValue ?? 0) > 0;
							availableSourceAccounts.push({
								accountId: candidateId,
								accountName: candidateAccount.name,
								availableNow,
								availableFromDate: availableFrom ? toYearMonthInt(availableFrom) : null
							});
							continue;
						}
						if (candidateAccount.type === 'super_account') {
							const superAssetId = superByAccountId.get(candidateId);
							const superState = superAssetId ? superStates.get(superAssetId) : null;
							if (!superState) continue;
							availableFrom = maxYearMonth(availableFrom, superState.startDate);
							availableFrom = maxYearMonth(availableFrom, superState.preservationDate);
							const superStarted =
								!superState.startDate || monthsBetweenYearMonths(superState.startDate, current) >= 0;
							const preservationReached =
								!superState.preservationDate ||
								monthsBetweenYearMonths(superState.preservationDate, current) >= 0;
							availableNow =
								accountStarted &&
								superStarted &&
								preservationReached &&
								(superState.currentValue ?? 0) > 0;
							availableSourceAccounts.push({
								accountId: candidateId,
								accountName: candidateAccount.name,
								availableNow,
								availableFromDate: availableFrom ? toYearMonthInt(availableFrom) : null
							});
						}
					}
					plannerFirstShortfall = {
						targetAccountId: accountId,
						targetAccountName: accountInfo.name,
						minBalance,
						startDate: currentDate,
						monthLabel,
						availableSourceAccounts
					};
				}
				events.push({
					tone: 'negative',
					monthLabel,
					message:
						minBalance > 0
							? `Account ${accountInfo.name} drops below its reserve target (${formatEventCurrency(minBalance)}).`
							: `Account ${accountInfo.name} runs out of money.`
				});
				insolventEventAccountIds.add(accountId);
			}
		}
	}

	if (!events.some((event) => event.tone === 'negative')) {
		events.unshift({
			tone: 'positive',
			monthLabel: formatYearMonthLabel(startYearMonth),
			message: 'Congratulations - you are solvent for this time frame.'
		});
	}

	const firstShortfall = plannerFirstShortfall;

	return {
		startDate: toYearMonthInt(startYearMonth),
		endDate: toYearMonthInt(endYearMonth),
		transactions,
		accounts: accountSeries,
		assets: assetSeries,
		liquidity: {
			series: liquiditySeries,
			points: liquidityPoints
		},
		planner: {
			status: firstShortfall ? 'needs_attention' : 'on_track',
			headline: firstShortfall
				? firstShortfall.minBalance > 0
					? `${firstShortfall.targetAccountName} is projected to drop below its reserve target (${formatEventCurrency(firstShortfall.minBalance)}) in ${firstShortfall.monthLabel}.`
					: `${firstShortfall.targetAccountName} is projected to drop below $0 in ${firstShortfall.monthLabel}.`
				: 'On track: no cash account is projected to fall below $0.',
			firstShortfall
		},
		events
	};
};

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
	events: {
		tone: 'negative' | 'positive';
		message: string;
	}[];
};

type ProjectionCashflow = {
	id: string;
	cashflow_type: 'expense' | 'income' | 'transfer';
	category:
		| 'living_expenses'
		| 'employment_income'
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
	details: Record<string, unknown>;
};

type ProjectionAsset = {
	asset_type: 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';
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

const getOpeningBalance = (details: Record<string, unknown>) => {
	const value = details?.openingBalance;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
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

export const buildProjection = (input: {
	inflationRate?: number | null;
	interestRateChange?: number | null;
	projectionRange?: '1y' | '5y' | '10y' | 'all';
	maxMonths?: number | null;
	cashflows: ProjectionCashflow[];
	accounts: ProjectionAccount[];
	assets: ProjectionAsset[];
	assetAccounts: ProjectionAssetAccount[];
}): ProjectionResult => {
	const startYearMonth = (() => {
		const candidates: YearMonth[] = [];
		for (const cashflow of input.cashflows) {
			const start = parseYearMonth(cashflow.start_date);
			if (start) candidates.push(start);
		}
		for (const account of input.accounts) {
			const start = parseYearMonth(account.details?.startDate);
			if (start) candidates.push(start);
		}
		for (const asset of input.assets) {
			const start = parseYearMonth(asset.details?.startDate);
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
	const interestRateChange = input.interestRateChange ?? 0;

	const accountMap = new Map(
		input.accounts.map((account) => [
			account.id,
			{
				name: account.name,
				type: account.account_type,
				interestRate: getInterestRate(account.details),
				startDate: parseYearMonth(account.details?.startDate),
				openingBalance: getOpeningBalance(account.details),
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
			message: `Mortgage ${mortgageAccount.name} paid off on ${monthLabel}.`
		});
		mortgagePaidOffEventAccountIds.add(mortgageAccountId);
	};
	for (const asset of input.assets) {
		if (asset.asset_type !== 'property' || !asset.id) continue;
		const startDateValue = asset.details?.startDate;
		const saleDateValue = asset.details?.saleDate;
		const startDate = parseYearMonth(startDateValue);
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
		const startDateValue = asset.details?.startDate;
		const startDate = parseYearMonth(startDateValue);
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
			const mortgageAccountDetails =
				input.accounts.find((account) => account.id === mortgageAccountId)?.details ?? {};
			const accountStartDate = parseYearMonth(mortgageAccountDetails?.startDate);
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
		const startDate = parseYearMonth(details.startDate);
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
		const startDate = parseYearMonth(details.startDate);
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
					const tradeAmount = Math.min(rawAmount, Math.max(0, shareState.currentValue));
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
								message: `Super ${superState.assetName} transfer blocked before preservation age on ${monthLabel}.`
							});
							superState.blockedWithdrawalEventRecorded = true;
						}
						continue;
					}

					const superAssetName = superState.assetName ?? null;
					const tradeAmount = Math.min(rawAmount, Math.max(0, superState.currentValue));
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
						message: `Super ${state.assetName} reaches preservation age on ${formatYearMonthLabel(state.preservationDate)}.`
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
				message: `${property.assetName} sold on ${monthLabel} for ${formatEventCurrency(saleAmount)}.`
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
			const effectiveRate = baseRate + interestRateChange;
			const monthlyRate = effectiveRate / 100 / 12;
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
			const effectiveRate = baseRate + interestRateChange;
			const monthlyRate = effectiveRate / 100 / 12;
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

		for (const accountId of cashAccountIds) {
			if (insolventEventAccountIds.has(accountId)) continue;
			const accountInfo = accountMap.get(accountId);
			if (!accountInfo) continue;
			if (accountInfo.startDate && monthsBetweenYearMonths(accountInfo.startDate, current) < 0) continue;
			if (accountInfo.balance < 0) {
				events.push({
					tone: 'negative',
					message: `Account ${accountInfo.name} runs out of money on ${monthLabel}.`
				});
				insolventEventAccountIds.add(accountId);
			}
		}
	}

	if (insolventEventAccountIds.size === 0) {
		events.unshift({
			tone: 'positive',
			message: 'Congratulations - you are solvent for this time frame.'
		});
	}

	return {
		startDate: toYearMonthInt(startYearMonth),
		endDate: toYearMonthInt(endYearMonth),
		transactions,
		accounts: accountSeries,
		assets: assetSeries,
		events
	};
};

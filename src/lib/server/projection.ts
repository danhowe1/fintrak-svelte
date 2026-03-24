type YearMonth = {
	year: number;
	month: number;
};

export type ProjectionTransaction = {
	cashflowId: string;
	cashflowType: 'expense' | 'income' | 'transfer';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'asset_ownership'
		| 'mortgage_repayment'
		| 'other'
		| 'interest';
	assetName?: string | null;
	description?: string | null;
	accountId: string;
	accountName: string;
	amount: number;
	date: string;
	monthLabel: string;
};

export type AccountBalancePoint = {
	date: string;
	monthLabel: string;
	balance: number;
};

export type AccountBalanceSeries = {
	accountId: string;
	accountName: string;
	points: AccountBalancePoint[];
};

export type ProjectionResult = {
	startDate: string;
	endDate: string;
	transactions: ProjectionTransaction[];
	accounts: AccountBalanceSeries[];
};

type ProjectionCashflow = {
	id: string;
	cashflow_type: 'expense' | 'income' | 'transfer';
	category: 'living_expenses' | 'employment_income' | 'asset_ownership' | 'other';
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
	amount: number;
	inflation_affected: boolean;
	start_date: string;
	end_date: string | null;
	source_account_id: string | null;
	destination_account_id: string | null;
};

type ProjectionAccount = {
	id: string;
	account_type:
		| 'current_account'
		| 'mortgage_account'
		| 'savings_account'
		| 'credit_card'
		| 'brokerage'
		| 'super_account';
	name: string;
	details: Record<string, unknown>;
};

type ProjectionAsset = {
	asset_type: 'person' | 'property' | 'mortgage' | 'superannuation';
	details: Record<string, unknown>;
	id?: string;
};

type ProjectionAssetAccount = {
	asset_id: string;
	account_id: string;
	relationship_role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
};

const parseYearMonth = (value?: unknown): YearMonth | null => {
	if (!value) return null;
	const normalized =
		value instanceof Date
			? value.toISOString().slice(0, 10)
			: typeof value === 'string'
				? value
				: null;
	if (!normalized) return null;
	const match = normalized.match(/^(\d{4})-(\d{2})/);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
		return null;
	}
	return { year, month };
};

const formatYearMonth = (value: YearMonth) => {
	const month = String(value.month).padStart(2, '0');
	return `${value.year}-${month}-01`;
};

const formatMonthLabel = (value: YearMonth) =>
	`${String(value.month).padStart(2, '0')} ${value.year}`;

const addMonths = (value: YearMonth, monthsToAdd: number): YearMonth => {
	const total = value.year * 12 + (value.month - 1) + monthsToAdd;
	const year = Math.floor(total / 12);
	const month = (total % 12) + 1;
	return { year, month };
};

const monthsBetween = (from: YearMonth, to: YearMonth) =>
	(to.year - from.year) * 12 + (to.month - from.month);

const monthIndex = (value: YearMonth) => value.year * 12 + (value.month - 1);

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
		if (typeof dobValue !== 'string') continue;
		const dob = parseYearMonth(dobValue);
		if (!dob) continue;
		if (!youngestDob || monthsBetween(youngestDob, dob) > 0) {
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
	scenarioStartDate?: string | null;
	inflationRate?: number | null;
	interestRateChange?: number | null;
	maxMonths?: number | null;
	cashflows: ProjectionCashflow[];
	accounts: ProjectionAccount[];
	assets: ProjectionAsset[];
	assetAccounts: ProjectionAssetAccount[];
}): ProjectionResult => {
	const startYearMonth = parseYearMonth(input.scenarioStartDate ?? undefined) ??
		parseYearMonth(input.cashflows[0]?.start_date) ?? { year: new Date().getFullYear(), month: 1 };

	const cappedEnd = (() => {
		const naturalEnd = getYoungestHundredYearMonth(input.assets, startYearMonth);
		if (!input.maxMonths || input.maxMonths <= 0) {
			return naturalEnd;
		}
		const capped = addMonths(startYearMonth, input.maxMonths - 1);
		const naturalIndex = naturalEnd.year * 12 + (naturalEnd.month - 1);
		const cappedIndex = capped.year * 12 + (capped.month - 1);
		return cappedIndex < naturalIndex ? capped : naturalEnd;
	})();
	const endYearMonth = cappedEnd;
	const totalMonths = Math.max(0, monthsBetween(startYearMonth, endYearMonth));
	const inflationRate = input.inflationRate ?? 0;
	const interestRateChange = input.interestRateChange ?? 0;

	const accountMap = new Map(
		input.accounts.map((account) => [
			account.id,
			{
				name: account.name,
				type: account.account_type,
				interestRate: getInterestRate(account.details),
				balance: getOpeningBalance(account.details)
			}
		])
	);

	const transactions: ProjectionTransaction[] = [];
	const accountSeries: AccountBalanceSeries[] = input.accounts.map((account) => ({
		accountId: account.id,
		accountName: account.name,
		points: []
	}));

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
		const dob = typeof dobValue === 'string' ? parseYearMonth(dobValue) : null;
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
	for (const asset of input.assets) {
		if (asset.asset_type !== 'property') continue;
		const saleDateValue = asset.details?.saleDate;
		const saleDate = typeof saleDateValue === 'string' ? parseYearMonth(saleDateValue) : null;
		if (!saleDate) continue;
		if (asset.id) {
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

	const mortgageStates = new Map<
		string,
		{
			mortgageAccountId: string;
			fundingSourceAccountId: string;
			offsetAccountId: string | null;
			termRemainingMonths: number;
			startDate: YearMonth | null;
		}
	>();
	for (const asset of input.assets) {
		if (asset.asset_type !== 'mortgage' || !asset.id) continue;
		const termMonths = getTermMonths(asset.details ?? {});
		const startDateValue = asset.details?.startDate;
		const startDate = typeof startDateValue === 'string' ? parseYearMonth(startDateValue) : null;
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
			mortgageStates.set(asset.id, {
				mortgageAccountId,
				fundingSourceAccountId,
				offsetAccountId,
				termRemainingMonths: termMonths,
				startDate
			});
		}
	}

	for (let i = 0; i <= totalMonths; i += 1) {
		const current = addMonths(startYearMonth, i);
		const monthLabel = formatMonthLabel(current);
		const currentDate = formatYearMonth(current);
		const yearDiff = current.year - startYearMonth.year;
		const inflationFactor = Math.pow(1 + inflationRate / 100, yearDiff);

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
			const monthDiff = monthsBetween(start, current);
			if (monthDiff < 0) continue;
			if (end && monthsBetween(current, end) > 0) continue;

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
					const startIndex = monthIndex(start);
					const currentIndex = monthIndex(current);
					if (cashflow.category === 'employment_income') {
						const retirementIndex = monthIndex(person.retirementDate);
						if (startIndex <= retirementIndex && currentIndex >= retirementIndex) {
							continue;
						}
					}
					if (cashflow.category === 'living_expenses') {
						const hundredIndex = monthIndex(person.hundredDate);
						if (startIndex <= hundredIndex && currentIndex >= hundredIndex) {
							continue;
						}
					}
				}

				const propertySaleDate = accountToPropertySale.get(cashflowAccountId);
				if (propertySaleDate && cashflow.category === 'asset_ownership') {
					const startIndex = monthIndex(start);
					const currentIndex = monthIndex(current);
					const saleIndex = monthIndex(propertySaleDate);
					if (startIndex <= saleIndex && currentIndex >= saleIndex) {
						continue;
					}
				}
			}

			const rawAmount = cashflow.inflation_affected
				? cashflow.amount * inflationFactor
				: cashflow.amount;

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
			}
		}

		for (const [assetId, state] of mortgageStates.entries()) {
			if (state.termRemainingMonths <= 0) continue;
			if (state.startDate && monthsBetween(state.startDate, current) < 0) {
				continue;
			}

			const mortgageAccount = accountMap.get(state.mortgageAccountId);
			if (!mortgageAccount) continue;
			const principal = Math.abs(mortgageAccount.balance);
			if (principal === 0) {
				state.termRemainingMonths -= 1;
				continue;
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
			const payment =
				monthlyRate === 0
					? principal / remaining
					: (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remaining));
			const interestAmount = interestPrincipal * monthlyRate;

			if (payment > 0) {
				pushTransaction(
					state.fundingSourceAccountId,
					-payment,
					'transfer',
					'mortgage_repayment',
					`mortgage_payment_${assetId}`
				);
				pushTransaction(
					state.mortgageAccountId,
					payment,
					'transfer',
					'mortgage_repayment',
					`mortgage_payment_${assetId}`
				);
			}

			if (interestAmount > 0) {
				pushTransaction(
					state.mortgageAccountId,
					-interestAmount,
					'expense',
					'interest',
					`mortgage_interest_${assetId}`
				);
			}

			state.termRemainingMonths -= 1;
		}

		for (const [accountId, accountInfo] of accountMap.entries()) {
			if (accountInfo.type !== 'current_account' && accountInfo.type !== 'savings_account') {
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
				balance: accountInfo?.balance ?? 0
			});
		}
	}

	return {
		startDate: formatYearMonth(startYearMonth),
		endDate: formatYearMonth(endYearMonth),
		transactions,
		accounts: accountSeries
	};
};

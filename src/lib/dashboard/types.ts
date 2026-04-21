export type ProjectionRange = '1y' | '5y' | '10y' | 'all';
export type ProjectionView = 'balances' | 'transactions' | 'balance_sheet' | 'profit_loss';
export type AssetPanelTab = 'assets' | 'accounts' | 'transfers' | 'reserves' | 'caps';
export type ProjectionBalanceSource = 'accounts' | 'assets' | 'net_worth' | 'liquidity';
export type TransactionSortKey = 'assetName' | 'accountName' | 'type' | 'category' | 'description';
export type TransactionSortDirection = 'asc' | 'desc';
export type MonthFrequency = 'monthly' | 'quarterly' | 'annually' | 'one_time';
export type AccountOption = { id: string; name: string };
export type LabelOption = { value: string; label: string };
export type PropertyUse = 'primary_residence' | 'investment_property';

export type AssetListItem = {
	id: string;
	asset_type: 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';
	name: string;
	start_date: number;
	details: Record<string, unknown>;
	property_id?: string | null;
	person_id?: string | null;
	created_at?: string;
};

export type AccountListItem = {
	id: string;
	account_type: 'cash_account' | 'mortgage_account' | 'credit_card' | 'brokerage' | 'super_account';
	name: string;
	start_date: number;
	opening_balance: number;
	details: Record<string, unknown>;
	created_at: string;
	relationships: {
		assetName: string;
		role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
	}[];
};

export type AssetAccountLink = {
	id: string;
	asset_id: string;
	account_id: string;
	relationship_role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
};

export type CashflowSummary = {
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
	frequency: MonthFrequency;
	amount: number;
	inflation_affected: boolean;
	start_date: number;
	end_date: number | null;
	description: string;
	source_asset_account_id: string | null;
	destination_asset_account_id: string | null;
	source_account_id: string | null;
	destination_account_id: string | null;
	source_asset_id: string | null;
	destination_asset_id: string | null;
	source_asset_name: string | null;
	destination_asset_name: string | null;
	source_account_name: string | null;
	destination_account_name: string | null;
};

export type CashflowDraft = {
	type: 'income' | 'expense';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'misc_income'
		| 'asset_ownership'
		| 'rental_income';
	frequency: MonthFrequency;
	amount: string;
	description: string;
	startDate: string;
	endDate: string;
	inflationAffected: boolean;
	assetAccountId: string;
	cashflowId?: string;
};

export type CashflowFormState = {
	assetId: string;
	type: 'income' | 'expense';
	cashflowId?: string;
} | null;

export type PersonDetail = { name: string; startDate: string; dob: string };
export type PersonDetailErrors = { name?: string; startDate?: string; dob?: string };

export type PropertyDetail = {
	name: string;
	startDate: string;
	propertyUse: PropertyUse;
	marketValue: number;
	marketGrowthRate: number;
	saleDate: string;
	fixedSellingCosts: number;
	variableSellingCosts: number;
};

export type PropertyErrors = {
	name?: string;
	startDate?: string;
	saleDate?: string;
	marketValue?: string;
	fixedSellingCosts?: string;
	variableSellingCosts?: string;
};

export type ShareDetail = {
	name: string;
	startDate: string;
	capitalGrowthRate: number;
	dividendYield: number;
	dividendsTakenAsIncomeDate: string;
};

export type ShareErrors = {
	name?: string;
	startDate?: string;
	capitalGrowthRate?: string;
	dividendYield?: string;
	dividendsTakenAsIncomeDate?: string;
};

export type SuperDetail = {
	preservationAge: number;
	capitalGrowthRate: number;
	managementFeeRate: number;
};

export type MortgageDetail = {
	name: string;
	startDate: string;
	termYears: number;
	termMonths: number;
	mortgageAccountName: string;
	openingBalance: number;
};

export type MortgageErrors = {
	name?: string;
	startDate?: string;
	termYears?: string;
	termMonths?: string;
	mortgageAccountName?: string;
	openingBalance?: string;
};

export type AccountEditDraft = {
	startDate: string;
	name: string;
	openingBalance: string;
};

export type TransferDraft = {
	sourceAccountId: string;
	destinationAccountId: string;
	amount: string;
	frequency: MonthFrequency;
	startDate: string;
	endDate: string;
	description: string;
	inflationAffected: boolean;
};

export type TransferEditDraft = {
	sourceAccountId: string;
	destinationAccountId: string;
	amount: string;
	frequency: MonthFrequency;
	startDate: string;
	endDate: string;
	description: string;
};

export type AutoFundingRule = {
	id: string;
	scenario_id: string;
	source_account_id: string;
	target_account_id: string;
	priority_order: number;
	enabled: boolean;
	min_target_balance: number;
	created_at: string;
	updated_at: string;
};

export type AutoSweepRule = {
	id: string;
	scenario_id: string;
	source_account_id: string;
	destination_account_id: string;
	priority_order: number;
	enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type AccountBalanceTarget = {
	id: string;
	scenario_id: string;
	account_id: string;
	min_balance: number;
	max_balance: number | null;
	enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type Stage3Profile = 'Conservative' | 'Balanced' | 'Growth';
export type Stage3Assessment = {
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

export type ChartPoint = { date: number; monthLabel: string; balance: number };
export type ChartSeries = { id: string; name: string; points: ChartPoint[] };

export type PnlNode = {
	id: string;
	label: string;
	level: number;
	values: number[];
	children?: PnlNode[];
};

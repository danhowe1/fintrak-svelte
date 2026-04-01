export type ScenarioDetails = {
	id: string;
	name: string;
	startDate: number;
	assets: Asset[];
};

export type PersonDetails = {
	type: 'person';
	id: string;
	name: string;
	dob: number;
	retirementAge: number;
	startDate: number;
};

export type PropertyDetails = {
	type: 'property';
	id: string;
	name: string;
	marketValue: number;
	startDate: number;
	marketGrowthRate: number;
	fixedSellingCosts: number;
	variableSellingCosts: number;
};

export type Asset = PersonDetails | PropertyDetails;

export type CashflowFrequency = 'monthly' | 'quarterly' | 'annually' | 'one_time';

export type CashflowType = 'expense' | 'income' | 'transfer';

export type CashflowCategory =
	| 'living_expenses'
	| 'employment_income'
	| 'misc_income'
	| 'asset_ownership'
	| 'rental_income'
	| 'transfer'
	| 'shares_purchase'
	| 'shares_sale';

export type Cashflow = {
	id: string;
	scenarioId: string;
	type: CashflowType;
	category: CashflowCategory;
	frequency: CashflowFrequency;
	amount: number;
	inflationAffected: boolean;
	startDate: number;
	endDate?: number | null;
	sourceAssetAccountId?: string | null;
	destinationAssetAccountId?: string | null;
	description: string;
	createdBy?: string;
	createdAt?: string;
	updatedAt?: string;
};

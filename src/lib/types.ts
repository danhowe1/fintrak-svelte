export type ScenarioDetails = {
	id: string;
	name: string;
	startDate: string;
	assets: Asset[];
};

export type PersonDetails = {
	type: 'person';
	id: string;
	name: string;
	dob: string;
	retirementAge: number;
	startDate: string;
};

export type PropertyDetails = {
	type: 'property';
	id: string;
	name: string;
	marketValue: number;
	startDate: string;
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
	| 'asset_ownership'
	| 'rental_income'
	| 'other';

export type Cashflow = {
	id: string;
	scenarioId: string;
	type: CashflowType;
	category: CashflowCategory;
	frequency: CashflowFrequency;
	amount: number;
	inflationAffected: boolean;
	startDate: string;
	endDate?: string | null;
	sourceAssetAccountId?: string | null;
	destinationAssetAccountId?: string | null;
	description: string;
	createdBy?: string;
	createdAt?: string;
	updatedAt?: string;
};

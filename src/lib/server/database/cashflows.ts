import {
	getPool,
	runAuthorizedScenarioMutation,
	AUTHORIZED_SCENARIO_CTE,
	type DbClient
} from './shared';

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
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
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

export type InsertCashflowInput = {
	scenarioId: string;
	type: 'expense' | 'income' | 'transfer';
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'misc_income'
		| 'asset_ownership'
		| 'rental_income'
		| 'transfer'
		| 'shares_purchase'
		| 'shares_sale';
	amount: number;
	inflationAffected?: boolean;
	startDate: number;
	endDate?: number | null;
	sourceAssetAccountId?: string | null;
	destinationAssetAccountId?: string | null;
	description: string;
	createdBy: string;
};

export async function insertCashflow(client: DbClient, input: InsertCashflowInput) {
	await client.query(
		`
			insert into cashflows (
				scenario_id,
				cashflow_type,
				frequency,
				category,
				amount,
				inflation_affected,
				start_date,
				end_date,
				source_asset_account_id,
				destination_asset_account_id,
				description,
				created_by
			)
			values (
				$1::uuid,
				$2::cashflow_type,
				$3::cashflow_frequency,
				$4::cashflow_category,
				$5::numeric,
				$6::boolean,
				$7::int,
				$8::int,
				$9::uuid,
				$10::uuid,
				$11::text,
				$12::text
			)
		`,
		[
			input.scenarioId,
			input.type,
			input.frequency,
			input.category,
			input.amount,
			input.inflationAffected ?? true,
			input.startDate,
			input.endDate ?? null,
			input.sourceAssetAccountId ?? null,
			input.destinationAssetAccountId ?? null,
			input.description,
			input.createdBy
		]
	);
}


export async function createCashflow(input: {
	scenarioId: string;
	type: 'expense' | 'income' | 'transfer';
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'misc_income'
		| 'asset_ownership'
		| 'rental_income'
		| 'transfer'
		| 'shares_purchase'
		| 'shares_sale';
	amount: number;
	inflationAffected: boolean;
	startDate: number;
	endDate?: number | null;
	sourceAssetAccountId?: string | null;
	destinationAssetAccountId?: string | null;
	description: string;
	createdBy: string;
}) {
	await getPool().query(
		`
			insert into cashflows (
				scenario_id,
				cashflow_type,
				frequency,
				category,
				amount,
				inflation_affected,
				start_date,
				end_date,
				source_asset_account_id,
				destination_asset_account_id,
				description,
				created_by
			)
			values (
				$1::uuid,
				$2::cashflow_type,
				$3::cashflow_frequency,
				$4::cashflow_category,
				$5::numeric,
				$6::boolean,
				$7::int,
				$8::int,
				$9::uuid,
				$10::uuid,
				$11::text,
				$12::text
			)
		`,
		[
			input.scenarioId,
			input.type,
			input.frequency,
			input.category,
			input.amount,
			input.inflationAffected,
			input.startDate,
			input.endDate ?? null,
			input.sourceAssetAccountId ?? null,
			input.destinationAssetAccountId ?? null,
			input.description,
			input.createdBy
		]
	);
}

export async function updateCashflow(input: {
	userId: string;
	scenarioId: string;
	cashflowId: string;
	type: 'expense' | 'income' | 'transfer';
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
	category:
		| 'living_expenses'
		| 'employment_income'
		| 'misc_income'
		| 'asset_ownership'
		| 'rental_income'
		| 'transfer'
		| 'shares_purchase'
		| 'shares_sale';
	amount: number;
	inflationAffected: boolean;
	startDate: number;
	endDate?: number | null;
	sourceAssetAccountId?: string | null;
	destinationAssetAccountId?: string | null;
	description: string;
}) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update cashflows as c
			set cashflow_type = $4::cashflow_type,
				frequency = $5::cashflow_frequency,
				category = $6::cashflow_category,
				amount = $7::numeric,
				inflation_affected = $8::boolean,
				start_date = $9::int,
				end_date = $10::int,
				source_asset_account_id = $11::uuid,
				destination_asset_account_id = $12::uuid,
				description = $13::text
			from authorized_scenario
			where c.id = $3::uuid
			  and c.scenario_id = authorized_scenario.id
		`,
		[
			input.userId,
			input.scenarioId,
			input.cashflowId,
			input.type,
			input.frequency,
			input.category,
			input.amount,
			input.inflationAffected,
			input.startDate,
			input.endDate ?? null,
			input.sourceAssetAccountId ?? null,
			input.destinationAssetAccountId ?? null,
			input.description
		]
	);
}

export async function deleteCashflow(userId: string, scenarioId: string, cashflowId: string) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			delete from cashflows as c
			using authorized_scenario
			where c.id = $3::uuid
			  and c.scenario_id = authorized_scenario.id
		`,
		[userId, scenarioId, cashflowId]
	);
}

export async function updateCashflowAmount(
	userId: string,
	scenarioId: string,
	cashflowId: string,
	amount: number
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update cashflows as c
			set amount = $4::numeric
			from authorized_scenario
			where c.id = $3::uuid
			  and c.scenario_id = authorized_scenario.id
		`,
		[userId, scenarioId, cashflowId, amount]
	);
}

export async function updateCashflowInflationAffected(
	userId: string,
	scenarioId: string,
	cashflowId: string,
	inflationAffected: boolean
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update cashflows as c
			set inflation_affected = $4::boolean
			from authorized_scenario
			where c.id = $3::uuid
			  and c.scenario_id = authorized_scenario.id
		`,
		[userId, scenarioId, cashflowId, inflationAffected]
	);
}

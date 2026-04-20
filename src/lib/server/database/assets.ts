import { parseYearMonthInput } from '$lib/yearMonth';
import {
	getPool,
	timedScenarioQuery,
	runAuthorizedScenarioMutation,
	normalizePropertyUse,
	clearPrimaryResidenceForOtherProperties,
	AUTHORIZED_SCENARIO_CTE,
	type DbClient,
	type PropertyUse
} from './shared';

export type AssetListItem = {
	id: string;
	asset_type: 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';
	name: string;
	start_date: number;
	details: Record<string, unknown>;
	property_id?: string | null;
	person_id?: string | null;
	created_at: string;
	relationships: {
		accountName: string;
		role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
	}[];
};

export type CreateAssetInput = {
	scenarioId: string;
	assetType: AssetListItem['asset_type'];
	name: string;
	startDate: number;
	details: Record<string, unknown>;
	propertyId?: string | null;
	personId?: string | null;
};

export type CreatePersonAssetWithCashflowsInput = {
	scenarioId: string;
	userId: string;
	name: string;
	dob: number;
	retirementAge: number;
	startDate: number;
	employmentIncome: number;
	essentialExpenses: number;
	incomeAccount:
		| { type: 'existing'; accountId: string }
		| { type: 'new'; name: string; interestRate: number; openingBalance: number };
	expenseAccount:
		| { type: 'existing'; accountId: string }
		| { type: 'new'; name: string; interestRate: number; openingBalance: number };
};

export type CreatePropertyAssetWithExpenseInput = {
	scenarioId: string;
	userId: string;
	name: string;
	startDate: number;
	propertyUse: PropertyUse;
	marketValue: number;
	marketGrowthRate: number;
	fixedSellingCosts: number;
	variableSellingCosts: number;
	saleDate?: number;
	ownershipExpense: number;
	expenseAccount:
		| { type: 'existing'; accountId: string }
		| { type: 'new'; name: string; interestRate: number; openingBalance: number };
};

export type CreateMortgageAssetWithAccountsInput = {
	scenarioId: string;
	userId: string;
	name: string;
	startDate: number;
	propertyId: string;
	details: Record<string, unknown>;
	mortgageAccount: { name: string; interestRate: number; openingBalance: number };
	paymentSourceAccount:
		| { type: 'existing'; accountId: string }
		| { type: 'new'; name: string; interestRate: number; openingBalance: number };
	offsetAccount?:
		| { type: 'none' }
		| { type: 'same_as_payment_source' }
		| { type: 'existing'; accountId: string }
		| { type: 'new'; name: string; interestRate: number; openingBalance: number };
};

export type CreateShareAssetWithBrokerageInput = {
	scenarioId: string;
	name: string;
	startDate: number;
	capitalGrowthRate: number;
	dividendYield: number;
	dividendsTakenAsIncomeDate: number;
	brokerageOpeningBalance: number;
	paysIntoAccountId: string;
};

export type CreateSuperannuationAssetWithAccountInput = {
	scenarioId: string;
	name: string;
	startDate: number;
	personId: string;
	paysIntoAccountId: string;
	preservationAge: number;
	capitalGrowthRate: number;
	managementFeeRate: number;
	openingBalance: number;
};

export async function getAssetsForScenario(scenarioId: string) {
	const result = await timedScenarioQuery<AssetListItem>(
		'getAssetsForScenario',
		`
			select
				a.id,
				a.asset_type,
				a.name,
				a.start_date,
				a.details,
				a.property_id,
				a.person_id,
				a.created_at,
				coalesce(
					jsonb_agg(
						distinct jsonb_build_object(
							'accountName', acc.name,
							'role', aa.relationship_role
						)
					) filter (where acc.id is not null),
					'[]'::jsonb
				) as relationships
			from assets a
			left join asset_accounts aa on aa.asset_id = a.id
			left join accounts acc on acc.id = aa.account_id
			where a.scenario_id = $1::uuid
			group by a.id
			order by a.created_at desc
		`,
		[scenarioId]
	);

	return result.rows;
}

export async function createAsset(input: CreateAssetInput, client?: DbClient) {
	const db = client ?? getPool();
	const result = await db.query<{ id: string }>(
		`
			insert into assets (scenario_id, asset_type, name, start_date, details, property_id, person_id)
			values ($1::uuid, $2::asset_type, $3::text, $4::int, $5::jsonb, $6::uuid, $7::uuid)
			returning id
		`,
		[
			input.scenarioId,
			input.assetType,
			input.name,
			input.startDate,
			input.details,
			input.propertyId ?? null,
			input.personId ?? null
		]
	);

	const assetId = result.rows[0]?.id;
	if (!assetId) {
		throw new Error('Asset insert failed');
	}

	return assetId;
}

export async function updatePersonRetirementAge(
	userId: string,
	scenarioId: string,
	assetId: string,
	retirementAge: number
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update assets
			set details = jsonb_set(
				coalesce(details, '{}'::jsonb),
				'{retirementAge}',
				to_jsonb($4::int),
				true
			)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
			  and a.asset_type = 'person'
		`,
		[userId, scenarioId, assetId, Math.round(retirementAge)]
	);
}

export async function updatePersonDetails(
	userId: string,
	scenarioId: string,
	assetId: string,
	input: { name: string; startDate: number; dob: number }
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update assets as a
			set name = $4::text,
				start_date = $5::int,
				details = jsonb_set(
					coalesce(details, '{}'::jsonb),
					'{dob}',
					to_jsonb($6::int),
					true
				)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
			  and a.asset_type = 'person'
		`,
		[userId, scenarioId, assetId, input.name, input.startDate, input.dob]
	);
}

export async function updatePropertyDetails(
	userId: string,
	scenarioId: string,
	assetId: string,
	input: {
		name: string;
		startDate: string;
		propertyUse: PropertyUse;
		marketValue: number;
		marketGrowthRate: number;
		saleDate?: string | null;
		fixedSellingCosts: number;
		variableSellingCosts: number;
	}
) {
	const saleDate =
		typeof input.saleDate === 'string' && input.saleDate.trim().length > 0
			? input.saleDate.trim()
			: null;
	const startDate = input.startDate.trim();
	const normalizedStartDate = parseYearMonthInput(startDate);
	const normalizedSaleDate = saleDate ? parseYearMonthInput(saleDate) : null;
	if (normalizedStartDate === null) {
		throw new Error('Invalid property start date');
	}
	const propertyUse = normalizePropertyUse(input.propertyUse);
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const updated = await runAuthorizedScenarioMutation(
			client,
			`
			${AUTHORIZED_SCENARIO_CTE}
			update assets as a
			set name = $4::text,
				start_date = $5::int,
				details = jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									jsonb_set(
										coalesce(details, '{}'::jsonb),
										'{marketValue}',
										to_jsonb($6::numeric),
										true
									),
									'{marketGrowthRate}',
									to_jsonb($7::numeric),
									true
								),
								'{saleDate}',
								case when $8::int is null then 'null'::jsonb else to_jsonb($8::int) end,
								true
							),
							'{fixedSellingCosts}',
							to_jsonb($9::numeric),
							true
						),
						'{variableSellingCosts}',
						to_jsonb($10::numeric),
						true
					),
					'{propertyUse}',
					to_jsonb($11::text),
					true
				)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
			  and a.asset_type = 'property'
		`,
			[
				userId,
				scenarioId,
				assetId,
				input.name,
				normalizedStartDate,
				input.marketValue,
				input.marketGrowthRate,
				normalizedSaleDate,
				input.fixedSellingCosts,
				input.variableSellingCosts,
				propertyUse
			]
		);
		if (!updated) {
			await client.query('rollback');
			return false;
		}
		if (propertyUse === 'primary_residence') {
			await clearPrimaryResidenceForOtherProperties(client, scenarioId, assetId);
		}
		await client.query('commit');
		return true;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function updateShareDetails(
	userId: string,
	scenarioId: string,
	assetId: string,
	input: {
		name: string;
		startDate: string;
		capitalGrowthRate: number;
		dividendYield: number;
		dividendsTakenAsIncomeDate: string;
	}
) {
	const startDate = input.startDate.trim();
	const dividendsTakenAsIncomeDate = input.dividendsTakenAsIncomeDate.trim();
	const normalizedStartDate = parseYearMonthInput(startDate);
	const normalizedDividendIncomeDate = parseYearMonthInput(dividendsTakenAsIncomeDate);
	if (normalizedStartDate === null) {
		throw new Error('Invalid shares start date');
	}
	if (normalizedDividendIncomeDate === null) {
		throw new Error('Invalid shares dividend income date');
	}

	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update assets as a
			set name = $4::text,
				start_date = $5::int,
				details = jsonb_set(
					jsonb_set(
						jsonb_set(
							coalesce(details, '{}'::jsonb),
							'{capitalGrowthRate}',
							to_jsonb(round($6::numeric, 1)),
							true
						),
						'{dividendYield}',
						to_jsonb(round($7::numeric, 1)),
							true
						),
						'{dividendsTakenAsIncomeDate}',
						to_jsonb($8::int),
						true
					)
		from authorized_scenario
		where a.id = $3::uuid
		  and a.scenario_id = authorized_scenario.id
		  and a.asset_type = 'shares'
		`,
		[
			userId,
			scenarioId,
			assetId,
			input.name,
			normalizedStartDate,
			input.capitalGrowthRate,
			input.dividendYield,
			normalizedDividendIncomeDate
		]
	);
}

export async function updateMortgageDetails(
	userId: string,
	scenarioId: string,
	assetId: string,
	input: {
		startDate: number;
		name: string;
		termYears: number;
		termMonths: number;
		mortgageAccountName: string;
		openingBalance: number;
	}
) {
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const updatedAsset = await runAuthorizedScenarioMutation(
			client,
			`
			${AUTHORIZED_SCENARIO_CTE}
			update assets as a
			set name = $4::text,
				start_date = $5::int,
				details = jsonb_set(
					jsonb_set(
						coalesce(details, '{}'::jsonb),
						'{termYears}',
						to_jsonb($6::int),
						true
					),
					'{termMonths}',
					to_jsonb($7::int),
					true
				)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
			  and a.asset_type = 'mortgage'
		`,
			[userId, scenarioId, assetId, input.name, input.startDate, input.termYears, input.termMonths]
		);
		if (!updatedAsset) {
			await client.query('rollback');
			return false;
		}

		const updatedAccount = await runAuthorizedScenarioMutation(
			client,
			`
			${AUTHORIZED_SCENARIO_CTE}
			update accounts a
			set name = $4::text,
				start_date = $6::int,
				opening_balance = $5::numeric
			from asset_accounts aa, authorized_scenario
			where aa.account_id = a.id
			  and aa.scenario_id = authorized_scenario.id
			  and aa.asset_id = $3::uuid
			  and aa.relationship_role = 'held_in'
			  and a.scenario_id = authorized_scenario.id
			  and a.account_type = 'mortgage_account'
		`,
			[
				userId,
				scenarioId,
				assetId,
				input.mortgageAccountName,
				input.openingBalance,
				input.startDate
			]
		);
		if (!updatedAccount) {
			await client.query('rollback');
			return false;
		}

		await client.query('commit');
		return true;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function updateSuperannuationDetails(
	userId: string,
	scenarioId: string,
	assetId: string,
	input: {
		preservationAge: number;
		capitalGrowthRate: number;
		managementFeeRate: number;
	}
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update assets as a
			set details = jsonb_set(
				jsonb_set(
					jsonb_set(
						coalesce(details, '{}'::jsonb),
						'{preservationAge}',
						to_jsonb($4::numeric),
						true
					),
					'{capitalGrowthRate}',
					to_jsonb($5::numeric),
						true
				),
				'{managementFeeRate}',
				to_jsonb($6::numeric),
				true
			)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
			  and a.asset_type = 'superannuation'
		`,
		[
			userId,
			scenarioId,
			assetId,
			input.preservationAge,
			input.capitalGrowthRate,
			input.managementFeeRate
		]
	);
}

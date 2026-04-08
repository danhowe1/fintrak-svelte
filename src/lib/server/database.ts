import { env } from '$env/dynamic/private';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { parseYearMonthInput } from '$lib/yearMonth';

const databaseUrlSchema = z
	.string()
	.min(1)
	.refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
		message: 'Database connection string must start with postgres:// or postgresql://'
	});

const scenarioCountRowSchema = z.object({
	scenario_count: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
});

const userIdSchema = z.string().min(1);
const userEmailSchema = z.string().trim().min(1).optional();
const userNameSchema = z.string().trim().min(1).optional();

let pool: Pool | undefined;

function getDatabaseUrl() {
	const connectionString = env.SUPABASE_DEV_DATABASE_URL ?? env.SUPABASE_DB_URL ?? env.DATABASE_URL;

	return databaseUrlSchema.parse(connectionString);
}

function getPool() {
	pool ??= new Pool({
		connectionString: getDatabaseUrl(),
		ssl:
			env.SUPABASE_DB_SSL === 'false'
				? false
				: {
						rejectUnauthorized: false
					}
	});

	return pool;
}

type DbClient = Pool | PoolClient;

export function getAuthenticatedUser(
	session: {
		user?: { id?: string | null; email?: string | null; name?: string | null };
	} | null
) {
	return {
		id: userIdSchema.parse(session?.user?.id),
		email: userEmailSchema.parse(session?.user?.email ?? undefined),
		name: userNameSchema.parse(session?.user?.name ?? undefined)
	};
}

export async function resolveAuthenticatedUserId(
	session: {
		user?: { id?: string | null; email?: string | null; name?: string | null };
	} | null
) {
	const { id, email, name } = getAuthenticatedUser(session);
	const provider = 'auth0';

	const identity = await getIdentity(provider, id);
	if (identity) {
		await ensureAppUser(identity.app_user_id, { email, name });
		return identity.app_user_id;
	}

	if (email) {
		const existingByEmail = await getAppUserIdByEmail(email);
		if (existingByEmail) {
			await ensureAppUser(existingByEmail, { email, name });
			await createIdentity(provider, id, existingByEmail);
			return existingByEmail;
		}
	}

	const newAppUserId = await createAppUser({ email, name });
	await createIdentity(provider, id, newAppUserId);
	return newAppUserId;
}

export async function countScenariosForUser(userId: string) {
	const result = await getPool().query<{ scenario_count: number | string }>(
		`
			select count(distinct s.id)::int as scenario_count
			from scenarios s
			left join scenario_members sm
				on sm.scenario_id = s.id
			   and sm.user_id = $1::text
			where sm.user_id is not null
			   or s.created_by = $1::text
		`,
		[userId]
	);

	const row = scenarioCountRowSchema.parse(result.rows[0]);
	return typeof row.scenario_count === 'number' ? row.scenario_count : Number(row.scenario_count);
}

export type ScenarioSummary = {
	id: string;
	name: string;
};

export type ScenarioListItem = {
	id: string;
	name: string;
	created_at: string;
};

export async function getSingleScenarioForUser(userId: string) {
	const result = await getPool().query<ScenarioSummary>(
		`
			select s.id, s.name
			from scenarios s
			left join scenario_members sm
				on sm.scenario_id = s.id
			   and sm.user_id = $1::text
			where sm.user_id is not null
			   or s.created_by = $1::text
			order by s.created_at desc
			limit 1
		`,
		[userId]
	);

	return result.rows[0] ?? null;
}

export async function getScenarioForUserById(userId: string, scenarioId: string) {
	const result = await getPool().query<ScenarioListItem>(
		`
			select s.id, s.name, s.created_at
			from scenarios s
			left join scenario_members sm
				on sm.scenario_id = s.id
			   and sm.user_id = $1::text
			where s.id = $2::uuid
			  and (sm.user_id is not null or s.created_by = $1::text)
			limit 1
		`,
		[userId, scenarioId]
	);

	return result.rows[0] ?? null;
}

export async function getScenariosForUser(userId: string) {
	const result = await getPool().query<ScenarioListItem>(
		`
			select distinct s.id, s.name, s.created_at
			from scenarios s
			left join scenario_members sm
				on sm.scenario_id = s.id
			   and sm.user_id = $1::text
			where sm.user_id is not null
			   or s.created_by = $1::text
			order by s.created_at desc
		`,
		[userId]
	);

	return result.rows;
}

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

export async function getAssetsForScenario(scenarioId: string) {
	const result = await getPool().query<AssetListItem>(
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

export type AccountListItem = {
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
	created_at: string;
	relationships: {
		assetName: string;
		role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
	}[];
};

export async function getAccountsForScenario(scenarioId: string) {
	const result = await getPool().query<AccountListItem>(
		`
			select
				a.id,
				a.account_type,
				a.name,
				a.start_date,
				a.opening_balance::double precision as opening_balance,
				a.details,
				a.created_at,
				coalesce(
					jsonb_agg(
						distinct jsonb_build_object(
							'assetName', ass.name,
							'role', aa.relationship_role
						)
					) filter (where ass.id is not null),
					'[]'::jsonb
				) as relationships
			from accounts a
			left join asset_accounts aa on aa.account_id = a.id
			left join assets ass on ass.id = aa.asset_id
			where a.scenario_id = $1::uuid
			group by a.id
			order by a.created_at desc
		`,
		[scenarioId]
	);

	return result.rows;
}

export async function updatePersonRetirementAge(
	scenarioId: string,
	assetId: string,
	retirementAge: number
) {
	await getPool().query(
		`
			update assets
			set details = jsonb_set(
				coalesce(details, '{}'::jsonb),
				'{retirementAge}',
				to_jsonb($3::int),
				true
			)
			where id = $2::uuid
			  and scenario_id = $1::uuid
			  and asset_type = 'person'
		`,
		[scenarioId, assetId, Math.round(retirementAge)]
	);
}

export async function updatePersonDetails(
	scenarioId: string,
	assetId: string,
	input: { name: string; startDate: number; dob: number }
) {
	await getPool().query(
		`
			update assets
			set name = $3::text,
				start_date = $4::int,
				details = jsonb_set(
					coalesce(details, '{}'::jsonb),
					'{dob}',
					to_jsonb($5::int),
					true
				)
			where id = $2::uuid
			  and scenario_id = $1::uuid
			  and asset_type = 'person'
		`,
		[scenarioId, assetId, input.name, input.startDate, input.dob]
	);
}

export async function updateCashflowAmount(
	scenarioId: string,
	cashflowId: string,
	amount: number
) {
	await getPool().query(
		`
			update cashflows
			set amount = $3::numeric
			where id = $2::uuid
			  and scenario_id = $1::uuid
		`,
		[scenarioId, cashflowId, amount]
	);
}

export async function updateCashflowInflationAffected(
	scenarioId: string,
	cashflowId: string,
	inflationAffected: boolean
) {
	await getPool().query(
		`
			update cashflows
			set inflation_affected = $3::boolean
			where id = $2::uuid
			  and scenario_id = $1::uuid
		`,
		[scenarioId, cashflowId, inflationAffected]
	);
}

export async function updatePropertyDetails(
	scenarioId: string,
	assetId: string,
	input: {
		name: string;
		startDate: string;
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
	await getPool().query(
		`
			update assets
			set name = $3::text,
				start_date = $4::int,
				details = jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									coalesce(details, '{}'::jsonb),
									'{marketValue}',
									to_jsonb($5::numeric),
									true
								),
								'{marketGrowthRate}',
								to_jsonb($6::numeric),
								true
							),
							'{saleDate}',
							case when $7::int is null then 'null'::jsonb else to_jsonb($7::int) end,
							true
						),
						'{fixedSellingCosts}',
						to_jsonb($8::numeric),
						true
					),
					'{variableSellingCosts}',
					to_jsonb($9::numeric),
					true
				)
			where id = $2::uuid
			  and scenario_id = $1::uuid
			  and asset_type = 'property'
		`,
		[
			scenarioId,
			assetId,
			input.name,
			normalizedStartDate,
			input.marketValue,
			input.marketGrowthRate,
			normalizedSaleDate,
			input.fixedSellingCosts,
			input.variableSellingCosts
		]
	);
}

export async function updateShareDetails(
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

	await getPool().query(
		`
			update assets
			set name = $3::text,
				start_date = $4::int,
				details = jsonb_set(
					jsonb_set(
						jsonb_set(
							coalesce(details, '{}'::jsonb),
							'{capitalGrowthRate}',
							to_jsonb($5::numeric),
							true
						),
						'{dividendYield}',
						to_jsonb($6::numeric),
						true
					),
					'{dividendsTakenAsIncomeDate}',
					to_jsonb($7::int),
					true
				)
			where id = $2::uuid
			  and scenario_id = $1::uuid
			  and asset_type = 'shares'
		`,
		[
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

export async function updateAccountInterestRate(
	scenarioId: string,
	accountId: string,
	interestRate: number
) {
	await getPool().query(
		`
			update accounts
			set details = jsonb_set(
				coalesce(details, '{}'::jsonb),
				'{interestRate}',
				to_jsonb(round($3::numeric, 2)),
				true
			)
			where id = $2::uuid
			  and scenario_id = $1::uuid
		`,
		[scenarioId, accountId, interestRate]
	);
}

export async function updateAccountDetails(
	scenarioId: string,
	accountId: string,
	input: {
		name: string;
		startDate: number;
		openingBalance: number;
	}
) {
	await getPool().query(
		`
			update accounts
			set name = $3::text,
				start_date = $4::int,
				opening_balance = round($5::numeric, 2)
			where id = $2::uuid
			  and scenario_id = $1::uuid
		`,
		[scenarioId, accountId, input.name, input.startDate, input.openingBalance]
	);
}

export async function updateMortgageDetails(
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
	await getPool().query(
		`
			update assets
			set name = $3::text,
				start_date = $4::int,
				details = jsonb_set(
					jsonb_set(
						coalesce(details, '{}'::jsonb),
						'{termYears}',
						to_jsonb($5::int),
						true
					),
					'{termMonths}',
					to_jsonb($6::int),
					true
				)
			where id = $2::uuid
			  and scenario_id = $1::uuid
			  and asset_type = 'mortgage'
		`,
		[scenarioId, assetId, input.name, input.startDate, input.termYears, input.termMonths]
	);

	await getPool().query(
		`
			update accounts a
			set name = $3::text,
				start_date = $5::int,
				opening_balance = $4::numeric
			from asset_accounts aa
			where aa.account_id = a.id
			  and aa.scenario_id = $1::uuid
			  and aa.asset_id = $2::uuid
			  and aa.relationship_role = 'held_in'
			  and a.scenario_id = $1::uuid
			  and a.account_type = 'mortgage_account'
		`,
		[
			scenarioId,
			assetId,
			input.mortgageAccountName,
			input.openingBalance,
			input.startDate
		]
	);
}

export async function updateSuperannuationDetails(
	scenarioId: string,
	assetId: string,
	input: {
		preservationAge: number;
		capitalGrowthRate: number;
		managementFeeRate: number;
	}
) {
	await getPool().query(
		`
			update assets
			set details = jsonb_set(
				jsonb_set(
					jsonb_set(
						coalesce(details, '{}'::jsonb),
						'{preservationAge}',
						to_jsonb($3::numeric),
						true
					),
					'{capitalGrowthRate}',
					to_jsonb($4::numeric),
					true
				),
				'{managementFeeRate}',
				to_jsonb($5::numeric),
				true
			)
			where id = $2::uuid
			  and scenario_id = $1::uuid
			  and asset_type = 'superannuation'
		`,
		[
			scenarioId,
			assetId,
			input.preservationAge,
			input.capitalGrowthRate,
			input.managementFeeRate
		]
	);
}

export type AssetAccountLink = {
	id: string;
	asset_id: string;
	account_id: string;
	relationship_role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
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

export async function getAutoFundingRulesForScenario(scenarioId: string) {
	const result = await getPool().query<AutoFundingRule>(
		`
			select
				id,
				scenario_id,
				source_account_id,
				target_account_id,
				priority_order,
				enabled,
				min_target_balance::double precision as min_target_balance,
				created_at,
				updated_at
			from auto_funding_rules
			where scenario_id = $1::uuid
			order by target_account_id asc, priority_order asc, created_at asc
		`,
		[scenarioId]
	);

	return result.rows;
}

export async function getAccountBalanceTargetsForScenario(scenarioId: string) {
	const result = await getPool().query<AccountBalanceTarget>(
		`
			select
				id,
				scenario_id,
				account_id,
				min_balance::double precision as min_balance,
				max_balance::double precision as max_balance,
				enabled,
				created_at,
				updated_at
			from account_balance_targets
			where scenario_id = $1::uuid
			order by created_at asc
		`,
		[scenarioId]
	);

	return result.rows;
}

export async function upsertAccountBalanceTarget(input: {
	scenarioId: string;
	accountId: string;
	minBalance: number;
	maxBalance?: number | null;
	enabled?: boolean;
}) {
	const result = await getPool().query<AccountBalanceTarget>(
		`
			insert into account_balance_targets (
				scenario_id,
				account_id,
				min_balance,
				max_balance,
				enabled
			)
			values (
				$1::uuid,
				$2::uuid,
				$3::numeric,
				$4::numeric,
				$5::boolean
			)
			on conflict (scenario_id, account_id)
			do update
			set min_balance = excluded.min_balance,
				max_balance = excluded.max_balance,
				enabled = excluded.enabled
			returning
				id,
				scenario_id,
				account_id,
				min_balance::double precision as min_balance,
				max_balance::double precision as max_balance,
				enabled,
				created_at,
				updated_at
		`,
		[
			input.scenarioId,
			input.accountId,
			input.minBalance,
			input.maxBalance ?? null,
			input.enabled ?? true
		]
	);

	return result.rows[0] ?? null;
}

export async function deleteAccountBalanceTarget(scenarioId: string, accountId: string) {
	await getPool().query(
		`
			delete from account_balance_targets
			where scenario_id = $1::uuid
			  and account_id = $2::uuid
		`,
		[scenarioId, accountId]
	);
}

export async function getAutoSweepRulesForScenario(scenarioId: string) {
	const result = await getPool().query<AutoSweepRule>(
		`
			select
				id,
				scenario_id,
				source_account_id,
				destination_account_id,
				priority_order,
				enabled,
				created_at,
				updated_at
			from auto_sweep_rules
			where scenario_id = $1::uuid
			order by source_account_id asc, priority_order asc, created_at asc
		`,
		[scenarioId]
	);

	return result.rows;
}

export async function createAutoFundingRule(input: {
	scenarioId: string;
	sourceAccountId: string;
	targetAccountId: string;
	priorityOrder?: number;
	enabled?: boolean;
	minTargetBalance?: number;
}) {
	const nextPriorityOrder =
		input.priorityOrder ??
		(
			await getPool().query<{ max_priority_order: number | null }>(
				`
					select max(priority_order)::int as max_priority_order
					from auto_funding_rules
					where scenario_id = $1::uuid
					  and target_account_id = $2::uuid
				`,
				[input.scenarioId, input.targetAccountId]
			)
		).rows[0]?.max_priority_order ?? 0;

	const result = await getPool().query<AutoFundingRule>(
		`
			insert into auto_funding_rules (
				scenario_id,
				source_account_id,
				target_account_id,
				priority_order,
				enabled,
				min_target_balance
			)
			values (
				$1::uuid,
				$2::uuid,
				$3::uuid,
				$4::int,
				$5::boolean,
				$6::numeric
			)
			on conflict (scenario_id, target_account_id, source_account_id)
			do update
			set enabled = excluded.enabled,
				min_target_balance = excluded.min_target_balance
			returning
				id,
				scenario_id,
				source_account_id,
				target_account_id,
				priority_order,
				enabled,
				min_target_balance::double precision as min_target_balance,
				created_at,
				updated_at
		`,
		[
			input.scenarioId,
			input.sourceAccountId,
			input.targetAccountId,
			nextPriorityOrder + (input.priorityOrder ? 0 : 1),
			input.enabled ?? true,
			input.minTargetBalance ?? 0
		]
	);

	return result.rows[0] ?? null;
}

export async function createAutoSweepRule(input: {
	scenarioId: string;
	sourceAccountId: string;
	destinationAccountId: string;
	priorityOrder?: number;
	enabled?: boolean;
}) {
	const nextPriorityOrder =
		input.priorityOrder ??
		(
			await getPool().query<{ max_priority_order: number | null }>(
				`
					select max(priority_order)::int as max_priority_order
					from auto_sweep_rules
					where scenario_id = $1::uuid
					  and source_account_id = $2::uuid
				`,
				[input.scenarioId, input.sourceAccountId]
			)
		).rows[0]?.max_priority_order ?? 0;

	const result = await getPool().query<AutoSweepRule>(
		`
			insert into auto_sweep_rules (
				scenario_id,
				source_account_id,
				destination_account_id,
				priority_order,
				enabled
			)
			values (
				$1::uuid,
				$2::uuid,
				$3::uuid,
				$4::int,
				$5::boolean
			)
			on conflict (scenario_id, source_account_id, destination_account_id)
			do update
			set enabled = excluded.enabled
			returning
				id,
				scenario_id,
				source_account_id,
				destination_account_id,
				priority_order,
				enabled,
				created_at,
				updated_at
		`,
		[
			input.scenarioId,
			input.sourceAccountId,
			input.destinationAccountId,
			nextPriorityOrder + (input.priorityOrder ? 0 : 1),
			input.enabled ?? true
		]
	);

	return result.rows[0] ?? null;
}

export async function deleteAutoFundingRule(scenarioId: string, ruleId: string) {
	await getPool().query(
		`
			delete from auto_funding_rules
			where scenario_id = $1::uuid
			  and id = $2::uuid
		`,
		[scenarioId, ruleId]
	);
}

export async function deleteAutoSweepRule(scenarioId: string, ruleId: string) {
	await getPool().query(
		`
			delete from auto_sweep_rules
			where scenario_id = $1::uuid
			  and id = $2::uuid
		`,
		[scenarioId, ruleId]
	);
}

export async function reorderAutoFundingRules(
	scenarioId: string,
	targetAccountId: string,
	ruleIdsInOrder: string[]
) {
	if (ruleIdsInOrder.length === 0) return;
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const result = await client.query<{ id: string }>(
			`
				select id
				from auto_funding_rules
				where scenario_id = $1::uuid
				  and target_account_id = $2::uuid
				order by priority_order asc, created_at asc
			`,
			[scenarioId, targetAccountId]
		);
		const existingIds = result.rows.map((row) => row.id);
		if (
			existingIds.length !== ruleIdsInOrder.length ||
			existingIds.some((id) => !ruleIdsInOrder.includes(id))
		) {
			throw new Error('Invalid rule ordering payload.');
		}
		// Use a temporary offset first to avoid violating the unique
		// (scenario_id, target_account_id, priority_order) constraint while swapping.
		const TEMP_PRIORITY_OFFSET = 1_000_000;
		for (let index = 0; index < ruleIdsInOrder.length; index += 1) {
			await client.query(
				`
					update auto_funding_rules
					set priority_order = $4::int
					where scenario_id = $1::uuid
					  and target_account_id = $2::uuid
					  and id = $3::uuid
				`,
				[scenarioId, targetAccountId, ruleIdsInOrder[index], TEMP_PRIORITY_OFFSET + index + 1]
			);
		}
		for (let index = 0; index < ruleIdsInOrder.length; index += 1) {
			await client.query(
				`
					update auto_funding_rules
					set priority_order = $4::int
					where scenario_id = $1::uuid
					  and target_account_id = $2::uuid
					  and id = $3::uuid
				`,
				[scenarioId, targetAccountId, ruleIdsInOrder[index], index + 1]
			);
		}
		await client.query('commit');
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function reorderAutoSweepRules(
	scenarioId: string,
	sourceAccountId: string,
	ruleIdsInOrder: string[]
) {
	if (ruleIdsInOrder.length === 0) return;
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const result = await client.query<{ id: string }>(
			`
				select id
				from auto_sweep_rules
				where scenario_id = $1::uuid
				  and source_account_id = $2::uuid
				order by priority_order asc, created_at asc
			`,
			[scenarioId, sourceAccountId]
		);
		const existingIds = result.rows.map((row) => row.id);
		if (
			existingIds.length !== ruleIdsInOrder.length ||
			existingIds.some((id) => !ruleIdsInOrder.includes(id))
		) {
			throw new Error('Invalid rule ordering payload.');
		}
		// Use a temporary offset first to avoid violating the unique
		// (scenario_id, source_account_id, priority_order) constraint while swapping.
		const TEMP_PRIORITY_OFFSET = 1_000_000;
		for (let index = 0; index < ruleIdsInOrder.length; index += 1) {
			await client.query(
				`
					update auto_sweep_rules
					set priority_order = $4::int
					where scenario_id = $1::uuid
					  and source_account_id = $2::uuid
					  and id = $3::uuid
				`,
				[scenarioId, sourceAccountId, ruleIdsInOrder[index], TEMP_PRIORITY_OFFSET + index + 1]
			);
		}
		for (let index = 0; index < ruleIdsInOrder.length; index += 1) {
			await client.query(
				`
					update auto_sweep_rules
					set priority_order = $4::int
					where scenario_id = $1::uuid
					  and source_account_id = $2::uuid
					  and id = $3::uuid
				`,
				[scenarioId, sourceAccountId, ruleIdsInOrder[index], index + 1]
			);
		}
		await client.query('commit');
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function getAssetAccountsForScenario(scenarioId: string) {
	const result = await getPool().query<AssetAccountLink>(
		`
			select id, asset_id, account_id, relationship_role
			from asset_accounts
			where scenario_id = $1::uuid
		`,
		[scenarioId]
	);

	return result.rows;
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

export async function deleteCashflow(scenarioId: string, cashflowId: string) {
	await getPool().query(
		`
			delete from cashflows
			where id = $2::uuid
			  and scenario_id = $1::uuid
		`,
		[scenarioId, cashflowId]
	);
}

export async function updateCashflow(input: {
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
	await getPool().query(
		`
			update cashflows
			set cashflow_type = $3::cashflow_type,
				frequency = $4::cashflow_frequency,
				category = $5::cashflow_category,
				amount = $6::numeric,
				inflation_affected = $7::boolean,
				start_date = $8::int,
				end_date = $9::int,
				source_asset_account_id = $10::uuid,
				destination_asset_account_id = $11::uuid,
				description = $12::text
			where id = $2::uuid
			  and scenario_id = $1::uuid
		`,
		[
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

export async function getCashflowsForScenario(scenarioId: string) {
	const result = await getPool().query<CashflowSummary>(
		`
			select
				c.id,
				c.cashflow_type,
				c.category,
				c.frequency,
				c.amount,
				c.inflation_affected,
				c.start_date,
				c.end_date,
				c.description,
				saa.id as source_asset_account_id,
				daa.id as destination_asset_account_id,
				saa.account_id as source_account_id,
				daa.account_id as destination_account_id,
				sasset.id as source_asset_id,
				dasset.id as destination_asset_id,
				sasset.name as source_asset_name,
				dasset.name as destination_asset_name,
				sacc.name as source_account_name,
				dacc.name as destination_account_name
			from cashflows c
			left join asset_accounts saa on saa.id = c.source_asset_account_id
			left join asset_accounts daa on daa.id = c.destination_asset_account_id
			left join assets sasset on sasset.id = saa.asset_id
			left join assets dasset on dasset.id = daa.asset_id
			left join accounts sacc on sacc.id = saa.account_id
			left join accounts dacc on dacc.id = daa.account_id
			where c.scenario_id = $1::uuid
			order by c.start_date asc, c.created_at asc
		`,
		[scenarioId]
	);

	return result.rows;
}

export type CreateAssetInput = {
	scenarioId: string;
	assetType: AssetListItem['asset_type'];
	name: string;
	startDate: number;
	details: Record<string, unknown>;
	propertyId?: string | null;
	personId?: string | null;
};

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

export type CreateAccountInput = {
	scenarioId: string;
	accountType: AccountListItem['account_type'];
	name: string;
	startDate: number;
	openingBalance: number;
	details: Record<string, unknown>;
};

export async function createAccount(input: CreateAccountInput, client?: DbClient) {
	const db = client ?? getPool();
	const result = await db.query<{ id: string }>(
		`
			insert into accounts (scenario_id, account_type, name, start_date, opening_balance, details)
			values ($1::uuid, $2::account_type, $3::text, $4::int, $5::numeric, $6::jsonb)
			returning id
		`,
		[
			input.scenarioId,
			input.accountType,
			input.name,
			input.startDate,
			input.openingBalance,
			input.details
		]
	);

	const accountId = result.rows[0]?.id;
	if (!accountId) {
		throw new Error('Account insert failed');
	}

	return accountId;
}

export async function createAccountWithHolders(input: CreateAccountInput & { holderAssetIds: string[] }) {
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const accountId = await createAccount(input, client);

		for (const assetId of input.holderAssetIds) {
			await getOrCreateAssetAccount(client, {
				scenarioId: input.scenarioId,
				assetId,
				accountId,
				role: 'held_in'
			});
		}

		await client.query('commit');
		return accountId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function getOrCreateAssetAccount(
	client: DbClient,
	input: {
		scenarioId: string;
		assetId: string;
		accountId: string;
		role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
	}
) {
	const existing = await client.query<{ id: string }>(
		`
			select id
			from asset_accounts
			where scenario_id = $1::uuid
			  and asset_id = $2::uuid
			  and account_id = $3::uuid
			  and relationship_role = $4::asset_account_role
			limit 1
		`,
		[input.scenarioId, input.assetId, input.accountId, input.role]
	);

	const existingId = existing.rows[0]?.id;
	if (existingId) {
		return existingId;
	}

	const inserted = await client.query<{ id: string }>(
		`
			insert into asset_accounts (scenario_id, asset_id, account_id, relationship_role)
			values ($1::uuid, $2::uuid, $3::uuid, $4::asset_account_role)
			returning id
		`,
		[input.scenarioId, input.assetId, input.accountId, input.role]
	);

	const assetAccountId = inserted.rows[0]?.id;
	if (!assetAccountId) {
		throw new Error('Asset account insert failed');
	}

	return assetAccountId;
}

export async function getOrCreateHeldInAssetAccount(input: {
	scenarioId: string;
	assetId: string;
	accountId: string;
}) {
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const assetAccountId = await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId: input.assetId,
			accountId: input.accountId,
			role: 'held_in'
		});
		await client.query('commit');
		return assetAccountId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export type CreateScenarioWithPersonInput = {
	userId: string;
	scenarioName: string;
	startDate: number;
	personName: string;
	personDob: number;
	retirementAge: number;
	monthlyNetIncome: number;
	monthlyEssentialExpenses: number;
	accountName: string;
	accountInterestRate: number;
	openingBalance: number;
};

export async function createScenarioWithPerson(input: CreateScenarioWithPersonInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		await ensureAppUser(input.userId, undefined, client);

		const scenarioId = await insertScenario(client, input);

		await insertScenarioMember(client, scenarioId, input.userId);
		const personAssetId = await insertPersonAsset(client, scenarioId, input);
		const accountId = await insertDefaultAccount(client, scenarioId, input);
		const assetAccountId = await insertAssetAccount(client, scenarioId, personAssetId, accountId);

		if (input.monthlyNetIncome > 0) {
			await insertCashflow(client, {
				scenarioId,
				type: 'income',
				frequency: 'monthly',
				category: 'employment_income',
				amount: input.monthlyNetIncome,
				startDate: input.startDate,
				destinationAssetAccountId: assetAccountId,
				description: 'Salary',
				createdBy: input.userId
			});
		}

		if (input.monthlyEssentialExpenses > 0) {
			await insertCashflow(client, {
				scenarioId,
				type: 'expense',
				frequency: 'monthly',
				category: 'living_expenses',
				amount: input.monthlyEssentialExpenses,
				startDate: input.startDate,
				sourceAssetAccountId: assetAccountId,
				description: 'Essential',
				createdBy: input.userId
			});
		}

		await client.query('commit');
		return scenarioId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

async function ensureAppUser(
	userId: string,
	input?: { email?: string; name?: string },
	client?: DbClient
) {
	const db = client ?? getPool();
	await db.query(
		`
			insert into app_users (id, email, name)
			values ($1::text, $2::text, $3::text)
			on conflict (id) do update
			set email = coalesce(excluded.email, app_users.email),
			    name = coalesce(excluded.name, app_users.name)
		`,
		[userId, input?.email ?? null, input?.name ?? null]
	);
}

async function getAppUserIdByEmail(email: string) {
	const result = await getPool().query<{ id: string }>(
		`
			select id
			from app_users
			where email = $1::text
			order by created_at asc
			limit 1
		`,
		[email]
	);

	return result.rows[0]?.id ?? null;
}

async function createAppUser(input?: { email?: string; name?: string }) {
	const result = await getPool().query<{ id: string }>(
		`
			insert into app_users (id, email, name)
			values (gen_random_uuid()::text, $1::text, $2::text)
			returning id
		`,
		[input?.email ?? null, input?.name ?? null]
	);

	const id = result.rows[0]?.id;
	if (!id) {
		throw new Error('App user insert failed');
	}

	return id;
}

async function getIdentity(provider: string, providerUserId: string) {
	const result = await getPool().query<{ app_user_id: string }>(
		`
			select app_user_id
			from app_user_identities
			where provider = $1::text
			  and provider_user_id = $2::text
			limit 1
		`,
		[provider, providerUserId]
	);

	return result.rows[0] ?? null;
}

async function createIdentity(provider: string, providerUserId: string, appUserId: string) {
	await getPool().query(
		`
			insert into app_user_identities (app_user_id, provider, provider_user_id)
			values ($1::text, $2::text, $3::text)
			on conflict (provider, provider_user_id) do nothing
		`,
		[appUserId, provider, providerUserId]
	);
}

async function insertScenario(client: DbClient, input: CreateScenarioWithPersonInput) {
	const scenarioResult = await client.query<{ id: string }>(
		`
			insert into scenarios (name, created_by)
			values ($1::text, $2::text)
			returning id
		`,
		[input.scenarioName, input.userId]
	);

	const scenarioId = scenarioResult.rows[0]?.id;
	if (!scenarioId) {
		throw new Error('Scenario insert failed');
	}

	return scenarioId;
}

async function insertScenarioMember(client: DbClient, scenarioId: string, userId: string) {
	await client.query(
		`
			insert into scenario_members (scenario_id, user_id, role)
			values ($1::uuid, $2::text, 'owner'::scenario_role)
		`,
		[scenarioId, userId]
	);
}

async function insertPersonAsset(
	client: DbClient,
	scenarioId: string,
	input: CreateScenarioWithPersonInput
) {
	const assetResult = await client.query<{ id: string }>(
		`
			insert into assets (scenario_id, asset_type, name, start_date, details)
			values (
				$1::uuid,
				'person'::asset_type,
				$2::text,
				$5::int,
				jsonb_build_object(
					'dob', $3::int,
					'retirementAge', $4::int
				)
			)
			returning id
		`,
		[scenarioId, input.personName, input.personDob, input.retirementAge, input.startDate]
	);

	const assetId = assetResult.rows[0]?.id;
	if (!assetId) {
		throw new Error('Person asset insert failed');
	}

	return assetId;
}

async function insertDefaultAccount(
	client: DbClient,
	scenarioId: string,
	input: CreateScenarioWithPersonInput
) {
	const accountResult = await client.query<{ id: string }>(
		`
			insert into accounts (scenario_id, account_type, name, start_date, opening_balance, details)
			values (
				$1::uuid,
				'cash_account'::account_type,
				$2::text,
				$5::int,
				$4::numeric,
				jsonb_build_object(
					'interestRate', $3::numeric
				)
			)
			returning id
		`,
		[scenarioId, input.accountName, input.accountInterestRate, input.openingBalance, input.startDate]
	);

	const accountId = accountResult.rows[0]?.id;
	if (!accountId) {
		throw new Error('Account insert failed');
	}

	return accountId;
}

async function insertAssetAccount(
	client: DbClient,
	scenarioId: string,
	assetId: string,
	accountId: string
) {
	const result = await client.query<{ id: string }>(
		`
			insert into asset_accounts (scenario_id, asset_id, account_id, relationship_role)
			values (
				$1::uuid,
				$2::uuid,
				$3::uuid,
				'held_in'::asset_account_role
			)
			returning id
		`,
		[scenarioId, assetId, accountId]
	);

	const assetAccountId = result.rows[0]?.id;
	if (!assetAccountId) {
		throw new Error('Asset account insert failed');
	}

	return assetAccountId;
}

type InsertCashflowInput = {
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

async function insertCashflow(client: DbClient, input: InsertCashflowInput) {
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

export async function createPersonAssetWithCashflows(input: CreatePersonAssetWithCashflowsInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		const assetId = await createAsset(
			{
				scenarioId: input.scenarioId,
				assetType: 'person',
				name: input.name,
				startDate: input.startDate,
				details: {
					dob: input.dob,
					retirementAge: input.retirementAge
				}
			},
			client
		);

		const resolveAccount = async (
			account:
				| { type: 'existing'; accountId: string }
				| { type: 'new'; name: string; interestRate: number; openingBalance: number }
		) => {
			if (account.type === 'existing') {
				return account.accountId;
			}

			return await createAccount(
				{
					scenarioId: input.scenarioId,
					accountType: 'cash_account',
					name: account.name,
					startDate: input.startDate,
					openingBalance: account.openingBalance,
					details: {
						interestRate: account.interestRate
					}
				},
				client
			);
		};

		const sameNewAccount =
			input.incomeAccount.type === 'new' &&
			input.expenseAccount.type === 'new' &&
			input.incomeAccount.name === input.expenseAccount.name &&
			input.incomeAccount.interestRate === input.expenseAccount.interestRate &&
			input.incomeAccount.openingBalance === input.expenseAccount.openingBalance;

		const incomeAccountId = await resolveAccount(input.incomeAccount);
		const expenseAccountId = sameNewAccount
			? incomeAccountId
			: await resolveAccount(input.expenseAccount);

		const incomeAssetAccountId = await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: incomeAccountId,
			role: 'held_in'
		});

		const expenseAssetAccountId = await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: expenseAccountId,
			role: 'held_in'
		});

		if (input.employmentIncome > 0) {
			await insertCashflow(client, {
				scenarioId: input.scenarioId,
				type: 'income',
				frequency: 'monthly',
				category: 'employment_income',
				amount: input.employmentIncome,
				startDate: input.startDate,
				destinationAssetAccountId: incomeAssetAccountId,
				description: 'Salary',
				createdBy: input.userId
			});
		}

		await insertCashflow(client, {
			scenarioId: input.scenarioId,
			type: 'expense',
			frequency: 'monthly',
			category: 'living_expenses',
			amount: input.essentialExpenses,
			startDate: input.startDate,
			sourceAssetAccountId: expenseAssetAccountId,
			description: 'Essential',
			createdBy: input.userId
		});

		await client.query('commit');
		return assetId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function createPropertyAssetWithExpense(input: CreatePropertyAssetWithExpenseInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		const assetId = await createAsset(
			{
				scenarioId: input.scenarioId,
				assetType: 'property',
				name: input.name,
				startDate: input.startDate,
				details: {
					marketValue: input.marketValue,
					marketGrowthRate: input.marketGrowthRate,
					fixedSellingCosts: input.fixedSellingCosts,
					variableSellingCosts: input.variableSellingCosts,
					...(input.saleDate ? { saleDate: input.saleDate } : {})
				}
			},
			client
		);

		const resolveAccount = async (
			account:
				| { type: 'existing'; accountId: string }
				| { type: 'new'; name: string; interestRate: number; openingBalance: number }
		) => {
			if (account.type === 'existing') {
				return account.accountId;
			}

			return await createAccount(
				{
					scenarioId: input.scenarioId,
					accountType: 'cash_account',
					name: account.name,
					startDate: input.startDate,
					openingBalance: account.openingBalance,
					details: {
						interestRate: account.interestRate
					}
				},
				client
			);
		};

		const expenseAccountId = await resolveAccount(input.expenseAccount);

		const expenseAssetAccountId = await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: expenseAccountId,
			role: 'held_in'
		});

		await insertCashflow(client, {
			scenarioId: input.scenarioId,
			type: 'expense',
			frequency: 'monthly',
			category: 'asset_ownership',
			amount: input.ownershipExpense,
			startDate: input.startDate,
			sourceAssetAccountId: expenseAssetAccountId,
			description: 'R&M',
			createdBy: input.userId
		});

		await client.query('commit');
		return assetId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function createMortgageAssetWithAccounts(input: CreateMortgageAssetWithAccountsInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const mortgageStartDate = input.startDate;

		const assetId = await createAsset(
			{
				scenarioId: input.scenarioId,
				assetType: 'mortgage',
				name: input.name,
				startDate: mortgageStartDate,
				details: input.details,
				propertyId: input.propertyId
			},
			client
		);

		const mortgageAccountId = await createAccount(
			{
				scenarioId: input.scenarioId,
				accountType: 'mortgage_account',
				name: input.mortgageAccount.name,
				startDate: mortgageStartDate,
				openingBalance: input.mortgageAccount.openingBalance,
				details: {
					interestRate: input.mortgageAccount.interestRate
				}
			},
			client
		);

		const resolvePaymentSourceAccount = async (
			account:
				| { type: 'existing'; accountId: string }
				| { type: 'new'; name: string; interestRate: number; openingBalance: number }
		) => {
			if (account.type === 'existing') {
				return account.accountId;
			}

			return await createAccount(
				{
					scenarioId: input.scenarioId,
					accountType: 'cash_account',
					name: account.name,
					startDate: mortgageStartDate,
					openingBalance: account.openingBalance,
					details: {
						interestRate: account.interestRate
					}
				},
				client
			);
		};

		const resolveOffsetAccount = async (
			account:
				| { type: 'none' }
				| { type: 'same_as_payment_source' }
				| { type: 'existing'; accountId: string }
				| { type: 'new'; name: string; interestRate: number; openingBalance: number }
		) => {
			if (account.type === 'none') {
				return null;
			}
			if (account.type === 'same_as_payment_source') {
				return paymentSourceAccountId;
			}
			if (account.type === 'existing') {
				return account.accountId;
			}
			return await createAccount(
				{
					scenarioId: input.scenarioId,
					accountType: 'cash_account',
					name: account.name,
					startDate: mortgageStartDate,
					openingBalance: account.openingBalance,
					details: {
						interestRate: account.interestRate
					}
				},
				client
			);
		};

		const paymentSourceAccountId = await resolvePaymentSourceAccount(input.paymentSourceAccount);
		const offsetAccountId = await resolveOffsetAccount(input.offsetAccount ?? { type: 'none' });

		await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: mortgageAccountId,
			role: 'held_in'
		});

		await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: paymentSourceAccountId,
			role: 'funding_source'
		});

		if (offsetAccountId) {
			await getOrCreateAssetAccount(client, {
				scenarioId: input.scenarioId,
				assetId,
				accountId: offsetAccountId,
				role: 'offsets'
			});
		}

		await client.query('commit');
		return assetId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function createShareAssetWithBrokerage(input: CreateShareAssetWithBrokerageInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		const assetId = await createAsset(
			{
				scenarioId: input.scenarioId,
				assetType: 'shares',
				name: input.name,
				startDate: input.startDate,
				details: {
					capitalGrowthRate: input.capitalGrowthRate,
					dividendYield: input.dividendYield,
					dividendsTakenAsIncomeDate: input.dividendsTakenAsIncomeDate
				}
			},
			client
		);

		const brokerageAccountId = await createAccount(
			{
				scenarioId: input.scenarioId,
				accountType: 'brokerage',
				name: `${input.name} Brokerage`,
				startDate: input.startDate,
				openingBalance: input.brokerageOpeningBalance,
				details: {
					interestRate: 0
				}
			},
			client
		);

		await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: brokerageAccountId,
			role: 'held_in'
		});

		await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: input.paysIntoAccountId,
			role: 'pays_into'
		});

		await client.query('commit');
		return assetId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

export async function createSuperannuationAssetWithAccount(
	input: CreateSuperannuationAssetWithAccountInput
) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		const assetId = await createAsset(
			{
				scenarioId: input.scenarioId,
				assetType: 'superannuation',
				name: input.name,
				startDate: input.startDate,
				personId: input.personId,
				details: {
					preservationAge: input.preservationAge,
					capitalGrowthRate: input.capitalGrowthRate,
					managementFeeRate: input.managementFeeRate
				}
			},
			client
		);

		const superAccountId = await createAccount(
			{
				scenarioId: input.scenarioId,
				accountType: 'super_account',
				name: `${input.name} Account`,
				startDate: input.startDate,
				openingBalance: input.openingBalance,
				details: {
					interestRate: 0
				}
			},
			client
		);

		await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: superAccountId,
			role: 'held_in'
		});
		await getOrCreateAssetAccount(client, {
			scenarioId: input.scenarioId,
			assetId,
			accountId: input.paysIntoAccountId,
			role: 'pays_into'
		});

		await client.query('commit');
		return assetId;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

import { env } from '$env/dynamic/private';
import { Pool } from 'pg';
import { z } from 'zod';

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

let pool: Pool | undefined;

function getDatabaseUrl() {
	const connectionString =
		env.SUPABASE_DEV_DATABASE_URL ?? env.SUPABASE_DB_URL ?? env.DATABASE_URL;

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

export function getAuthenticatedUserId(session: { user?: { id?: string | null } } | null) {
	return userIdSchema.parse(session?.user?.id);
}

export async function countScenariosForUser(userId: string) {
	await ensureAppUser(userId);
	const result = await getPool().query<{ scenario_count: number | string }>(
		`
			select count(*)::int as scenario_count
			from scenario_members
			where user_id = $1::text
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
	details: {
		startDate?: string;
		inflationRate?: number;
		interestRateRise?: number;
	};
	created_at: string;
};

export async function getSingleScenarioForUser(userId: string) {
	await ensureAppUser(userId);
	const result = await getPool().query<ScenarioSummary>(
		`
			select s.id, s.name
			from scenarios s
			inner join scenario_members sm on sm.scenario_id = s.id
			where sm.user_id = $1::text
			order by s.created_at desc
			limit 1
		`,
		[userId]
	);

	return result.rows[0] ?? null;
}

export async function getScenarioForUserById(userId: string, scenarioId: string) {
	await ensureAppUser(userId);
	const result = await getPool().query<ScenarioListItem>(
		`
			select s.id, s.name, s.details, s.created_at
			from scenarios s
			inner join scenario_members sm on sm.scenario_id = s.id
			where sm.user_id = $1::text
			  and s.id = $2::uuid
			limit 1
		`,
		[userId, scenarioId]
	);

	return result.rows[0] ?? null;
}

export async function getScenariosForUser(userId: string) {
	await ensureAppUser(userId);
	const result = await getPool().query<ScenarioListItem>(
		`
			select s.id, s.name, s.details, s.created_at
			from scenarios s
			inner join scenario_members sm on sm.scenario_id = s.id
			where sm.user_id = $1::text
			order by s.created_at desc
		`,
		[userId]
	);

	return result.rows;
}

export type CashflowSummary = {
	id: string;
	cashflow_type: 'expense' | 'income' | 'transfer';
	category: 'living_expenses' | 'employment_income' | 'other';
	frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
	amount: number;
	start_date: string;
	end_date: string | null;
	description: string | null;
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
				c.start_date,
				c.end_date,
				c.description,
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

export type CreateScenarioWithPersonInput = {
	userId: string;
	scenarioName: string;
	startDate: string;
	inflationRate: number;
	interestRateRise: number;
	personName: string;
	personDob: string;
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

		await ensureAppUser(input.userId, client);

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

async function ensureAppUser(userId: string, client?: Pool['prototype']) {
	const db = client ?? getPool();
	await db.query(
		`
			insert into app_users (id)
			values ($1::text)
			on conflict (id) do nothing
		`,
		[userId]
	);
}

async function insertScenario(client: Pool['prototype'], input: CreateScenarioWithPersonInput) {
	const scenarioResult = await client.query<{ id: string }>(
		`
			insert into scenarios (name, details, created_by)
			values (
				$1::text,
				jsonb_build_object(
					'startDate', $2::text,
					'inflationRate', $3::numeric,
					'interestRateRise', $4::numeric
				),
				$5::text
			)
			returning id
		`,
		[
			input.scenarioName,
			input.startDate,
			input.inflationRate,
			input.interestRateRise,
			input.userId
		]
	);

	const scenarioId = scenarioResult.rows[0]?.id;
	if (!scenarioId) {
		throw new Error('Scenario insert failed');
	}

	return scenarioId;
}

async function insertScenarioMember(
	client: Pool['prototype'],
	scenarioId: string,
	userId: string
) {
	await client.query(
		`
			insert into scenario_members (scenario_id, user_id, role)
			values ($1::uuid, $2::text, 'owner'::scenario_role)
		`,
		[scenarioId, userId]
	);
}

async function insertPersonAsset(
	client: Pool['prototype'],
	scenarioId: string,
	input: CreateScenarioWithPersonInput
) {
	const assetResult = await client.query<{ id: string }>(
		`
			insert into assets (scenario_id, asset_type, name, details)
			values (
				$1::uuid,
				'person'::asset_type,
				$2::text,
				jsonb_build_object(
					'dob', $3::text,
					'retirementAge', $4::int,
					'startDate', $5::text
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
	client: Pool['prototype'],
	scenarioId: string,
	input: CreateScenarioWithPersonInput
) {
	const accountResult = await client.query<{ id: string }>(
		`
			insert into accounts (scenario_id, account_type, name, details)
			values (
				$1::uuid,
				'current_account'::account_type,
				$2::text,
				jsonb_build_object(
					'interestRate', $3::numeric,
					'openingBalance', $4::numeric
				)
			)
			returning id
		`,
		[scenarioId, input.accountName, input.accountInterestRate, input.openingBalance]
	);

	const accountId = accountResult.rows[0]?.id;
	if (!accountId) {
		throw new Error('Account insert failed');
	}

	return accountId;
}

async function insertAssetAccount(
	client: Pool['prototype'],
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
	category: 'living_expenses' | 'employment_income' | 'other';
	amount: number;
	startDate: string;
	endDate?: string | null;
	sourceAssetAccountId?: string | null;
	destinationAssetAccountId?: string | null;
	description?: string | null;
	createdBy: string;
};

async function insertCashflow(client: Pool['prototype'], input: InsertCashflowInput) {
	await client.query(
		`
			insert into cashflows (
				scenario_id,
				cashflow_type,
				frequency,
				category,
				amount,
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
				$6::date,
				$7::date,
				$8::uuid,
				$9::uuid,
				$10::text,
				$11::text
			)
		`,
		[
			input.scenarioId,
			input.type,
			input.frequency,
			input.category,
			input.amount,
			input.startDate,
			input.endDate ?? null,
			input.sourceAssetAccountId ?? null,
			input.destinationAssetAccountId ?? null,
			input.description ?? null,
			input.createdBy
		]
	);
}

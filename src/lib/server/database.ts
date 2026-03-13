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

export type CreateScenarioWithPersonInput = {
	userId: string;
	scenarioName: string;
	startDate: string;
	inflationRate: number;
	interestRateRise: number;
	personName: string;
	personDob: string;
	retirementAge: number;
	accountName: string;
	accountInterestRate: number;
	openingBalance: number;
};

export async function createScenarioWithPerson(input: CreateScenarioWithPersonInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		await ensureAppUser(input.userId, client);

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

		await client.query(
			`
				insert into scenario_members (scenario_id, user_id, role)
				values ($1::uuid, $2::text, 'owner'::scenario_role)
			`,
			[scenarioId, input.userId]
		);

		await client.query(
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
			`,
			[
				scenarioId,
				input.personName,
				input.personDob,
				input.retirementAge,
				input.startDate
			]
		);

		await client.query(
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
			`,
			[scenarioId, input.accountName, input.accountInterestRate, input.openingBalance]
		);

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

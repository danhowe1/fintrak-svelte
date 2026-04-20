import { env } from '$env/dynamic/private';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { z } from 'zod';

const databaseUrlSchema = z
	.string()
	.min(1)
	.refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
		message: 'Database connection string must start with postgres:// or postgresql://'
	});

let pool: Pool | undefined;

export type DbClient = Pool | PoolClient;
export type PropertyUse = 'primary_residence' | 'investment_property';

export const AUTHORIZED_SCENARIO_CTE = `
	with authorized_scenario as (
		select s.id
		from scenarios s
		left join scenario_members sm
			on sm.scenario_id = s.id
		   and sm.user_id = $1::text
		where s.id = $2::uuid
		  and (sm.user_id is not null or s.created_by = $1::text)
		limit 1
	)
`;

function getDatabaseUrl() {
	const connectionString = env.SUPABASE_DEV_DATABASE_URL ?? env.SUPABASE_DB_URL ?? env.DATABASE_URL;
	return databaseUrlSchema.parse(connectionString);
}

export function getPool() {
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

export const timedScenarioQuery = async <T extends import('pg').QueryResultRow>(
	_label: string,
	query: string,
	values: unknown[]
) => getPool().query<T>(query, values);

export const runAuthorizedScenarioMutation = async (
	db: DbClient,
	query: string,
	values: unknown[]
) => {
	const result = await db.query(query, values);
	return (result.rowCount ?? 0) > 0;
};

export const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

export const normalizePropertyUse = (value: unknown): PropertyUse =>
	value === 'primary_residence' ? 'primary_residence' : 'investment_property';

export const clearPrimaryResidenceForOtherProperties = async (
	db: DbClient,
	scenarioId: string,
	assetId?: string
) => {
	await db.query(
		`
			update assets as a
			set details = jsonb_set(
				coalesce(details, '{}'::jsonb),
				'{propertyUse}',
				to_jsonb('investment_property'::text),
				true
			)
			where scenario_id = $1::uuid
			  and asset_type = 'property'
			  and ($2::uuid is null or id <> $2::uuid)
			  and coalesce(details->>'propertyUse', '') = 'primary_residence'
		`,
		[scenarioId, assetId ?? null]
	);
};

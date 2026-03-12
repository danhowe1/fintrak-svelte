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

const uuidSchema = z.string().uuid();

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
	return uuidSchema.parse(session?.user?.id);
}

export async function countScenariosForUser(userId: string) {
	const result = await getPool().query<{ scenario_count: number | string }>(
		`
			select count(*)::int as scenario_count
			from scenario_members
			where user_id = $1::uuid
		`,
		[userId]
	);

	const row = scenarioCountRowSchema.parse(result.rows[0]);
	return typeof row.scenario_count === 'number' ? row.scenario_count : Number(row.scenario_count);
}

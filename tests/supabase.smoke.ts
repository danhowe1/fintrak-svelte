import 'dotenv/config';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REQUIRED_TABLES = [
	'scenarios',
	'scenario_members',
	'assets',
	'accounts',
	'asset_accounts',
	'asset_owners'
] as const;

const REQUIRED_TYPES = ['asset_type', 'account_type', 'asset_account_role', 'scenario_role'] as const;

function getDatabaseUrl() {
	const connectionString =
		process.env.SUPABASE_DEV_DATABASE_URL ??
		process.env.SUPABASE_DB_URL ??
		process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error(
			'Missing database connection string. Set SUPABASE_DEV_DATABASE_URL, SUPABASE_DB_URL, or DATABASE_URL in your environment or .env file.'
		);
	}

	return connectionString;
}

describe('supabase dev database smoke test', () => {
	const client = new Client({
		connectionString: getDatabaseUrl(),
		ssl:
			process.env.SUPABASE_DB_SSL === 'false'
				? false
				: {
						rejectUnauthorized: false
					}
	});

	beforeAll(async () => {
		await client.connect();
	});

	afterAll(async () => {
		await client.end();
	});

	it('connects to the database', async () => {
		const result = await client.query<{ current_database: string }>('select current_database()');

		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].current_database).toBeTruthy();
	});

	it('has the expected schema tables', async () => {
		const result = await client.query<{ tablename: string }>(
			`
				select tablename
				from pg_catalog.pg_tables
				where schemaname = 'public'
					and tablename = any($1::text[])
			`,
			[[...REQUIRED_TABLES]]
		);

		expect(result.rows.map((row) => row.tablename).sort()).toEqual([...REQUIRED_TABLES].sort());
	});

	it('has the expected enum types', async () => {
		const result = await client.query<{ typname: string }>(
			`
				select typname
				from pg_type
				where typnamespace = 'public'::regnamespace
					and typname = any($1::text[])
			`,
			[[...REQUIRED_TYPES]]
		);

		expect(result.rows.map((row) => row.typname).sort()).toEqual([...REQUIRED_TYPES].sort());
	});
});

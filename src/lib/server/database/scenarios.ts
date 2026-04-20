import { z } from 'zod';
import { getPool, timedScenarioQuery, type DbClient } from './shared';

const scenarioCountRowSchema = z.object({
	scenario_count: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
});

export type ScenarioSummary = {
	id: string;
	name: string;
};

export type ScenarioRecord = {
	id: string;
	name: string;
	created_at: string;
};

export type ScenarioListItem = ScenarioRecord & {
	is_owner: boolean;
};

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

export async function getSingleScenarioForUser(userId: string) {
	const result = await timedScenarioQuery<ScenarioSummary>(
		'getSingleScenarioForUser',
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
	const result = await timedScenarioQuery<ScenarioRecord>(
		'getScenarioForUserById',
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
			select distinct s.id, s.name, s.created_at, (s.created_by = $1::text) as is_owner
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

export async function deleteScenarioForOwner(userId: string, scenarioId: string) {
	const result = await getPool().query<{ id: string }>(
		`
			delete from scenarios
			where id = $1::uuid
			  and created_by = $2::text
			returning id
		`,
		[scenarioId, userId]
	);

	return result.rows[0] ?? null;
}

export async function renameScenarioForOwner(
	userId: string,
	scenarioId: string,
	scenarioName: string
) {
	const result = await getPool().query<{ id: string }>(
		`
			update scenarios
			set name = $3::text
			where id = $1::uuid
			  and created_by = $2::text
			returning id
		`,
		[scenarioId, userId, scenarioName]
	);

	return result.rows[0] ?? null;
}

export async function insertScenarioRecord(client: DbClient, scenarioName: string, userId: string) {
	const scenarioResult = await client.query<{ id: string }>(
		`
			insert into scenarios (name, created_by)
			values ($1::text, $2::text)
			returning id
		`,
		[scenarioName, userId]
	);

	const scenarioId = scenarioResult.rows[0]?.id;
	if (!scenarioId) {
		throw new Error('Scenario insert failed');
	}

	return scenarioId;
}

export async function insertScenarioMember(client: DbClient, scenarioId: string, userId: string) {
	await client.query(
		`
			insert into scenario_members (scenario_id, user_id, role)
			values ($1::uuid, $2::text, 'owner'::scenario_role)
		`,
		[scenarioId, userId]
	);
}

import {
	getPool,
	timedScenarioQuery,
	runAuthorizedScenarioMutation,
	AUTHORIZED_SCENARIO_CTE,
	type DbClient
} from './shared';

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


export async function getOrCreateAssetAccount(
	client: DbClient,
	input: {
		scenarioId: string;
		assetId: string;
		accountId: string;
		role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
	}
) {
	const result = await client.query<{ id: string }>(
		`
			with inserted as (
				insert into asset_accounts (scenario_id, asset_id, account_id, relationship_role)
				values ($1::uuid, $2::uuid, $3::uuid, $4::asset_account_role)
				on conflict (scenario_id, asset_id, account_id, relationship_role) do nothing
				returning id
			)
			select id from inserted
			union all
			select aa.id
			from asset_accounts aa
			where aa.scenario_id = $1::uuid
			  and aa.asset_id = $2::uuid
			  and aa.account_id = $3::uuid
			  and aa.relationship_role = $4::asset_account_role
			limit 1
		`,
		[input.scenarioId, input.assetId, input.accountId, input.role]
	);

	const assetAccountId = result.rows[0]?.id;
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

export async function getAccountBalanceTargetsForScenario(scenarioId: string) {
	const result = await timedScenarioQuery<AccountBalanceTarget>(
		'getAccountBalanceTargetsForScenario',
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
	userId: string;
	scenarioId: string;
	accountId: string;
	minBalance: number;
	maxBalance?: number | null;
	enabled?: boolean;
}) {
	const result = await getPool().query<AccountBalanceTarget>(
		`
			${AUTHORIZED_SCENARIO_CTE}
			insert into account_balance_targets (
				scenario_id,
				account_id,
				min_balance,
				max_balance,
				enabled
			)
			select
				authorized_scenario.id,
				$3::uuid,
				$4::numeric,
				$5::numeric,
				$6::boolean
			from authorized_scenario
			where exists (
				select 1
				from accounts a
				where a.scenario_id = authorized_scenario.id
				  and a.id = $3::uuid
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
			input.userId,
			input.scenarioId,
			input.accountId,
			input.minBalance,
			input.maxBalance ?? null,
			input.enabled ?? true
		]
	);

	return result.rows[0] ?? null;
}

export async function deleteAccountBalanceTarget(
	userId: string,
	scenarioId: string,
	accountId: string
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			delete from account_balance_targets as abt
			using authorized_scenario
			where abt.scenario_id = authorized_scenario.id
			  and abt.account_id = $3::uuid
		`,
		[userId, scenarioId, accountId]
	);
}


export async function createAutoFundingRule(input: {
	userId: string;
	scenarioId: string;
	sourceAccountId: string;
	targetAccountId: string;
	priorityOrder?: number;
	enabled?: boolean;
	minTargetBalance?: number;
}) {
	const result = await getPool().query<AutoFundingRule>(
		`
			${AUTHORIZED_SCENARIO_CTE},
			next_priority as (
				select coalesce(max(priority_order), 0)::int as max_priority_order
				from auto_funding_rules
				where scenario_id = $2::uuid
				  and target_account_id = $4::uuid
			)
			insert into auto_funding_rules (
				scenario_id,
				source_account_id,
				target_account_id,
				priority_order,
				enabled,
				min_target_balance
			)
			select
				authorized_scenario.id,
				$3::uuid,
				$4::uuid,
				coalesce($5::int, next_priority.max_priority_order + 1),
				$6::boolean,
				$7::numeric
			from authorized_scenario
			cross join next_priority
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
			input.userId,
			input.scenarioId,
			input.sourceAccountId,
			input.targetAccountId,
			input.priorityOrder ?? null,
			input.enabled ?? true,
			input.minTargetBalance ?? 0
		]
	);

	return result.rows[0] ?? null;
}

export async function createAutoSweepRule(input: {
	userId: string;
	scenarioId: string;
	sourceAccountId: string;
	destinationAccountId: string;
	priorityOrder?: number;
	enabled?: boolean;
}) {
	const result = await getPool().query<AutoSweepRule>(
		`
			${AUTHORIZED_SCENARIO_CTE},
			next_priority as (
				select coalesce(max(priority_order), 0)::int as max_priority_order
				from auto_sweep_rules
				where scenario_id = $2::uuid
				  and source_account_id = $3::uuid
			)
			insert into auto_sweep_rules (
				scenario_id,
				source_account_id,
				destination_account_id,
				priority_order,
				enabled
			)
			select
				authorized_scenario.id,
				$3::uuid,
				$4::uuid,
				coalesce($5::int, next_priority.max_priority_order + 1),
				$6::boolean
			from authorized_scenario
			cross join next_priority
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
			input.userId,
			input.scenarioId,
			input.sourceAccountId,
			input.destinationAccountId,
			input.priorityOrder ?? null,
			input.enabled ?? true
		]
	);

	return result.rows[0] ?? null;
}

export async function deleteAutoFundingRule(userId: string, scenarioId: string, ruleId: string) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			delete from auto_funding_rules as afr
			using authorized_scenario
			where afr.scenario_id = authorized_scenario.id
			  and afr.id = $3::uuid
		`,
		[userId, scenarioId, ruleId]
	);
}

export async function deleteAutoSweepRule(userId: string, scenarioId: string, ruleId: string) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			delete from auto_sweep_rules as asr
			using authorized_scenario
			where asr.scenario_id = authorized_scenario.id
			  and asr.id = $3::uuid
		`,
		[userId, scenarioId, ruleId]
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

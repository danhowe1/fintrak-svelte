import {
	getPool,
	timedScenarioQuery,
	runAuthorizedScenarioMutation,
	AUTHORIZED_SCENARIO_CTE,
	type DbClient
} from './shared';
import { getOrCreateAssetAccount } from './funding-rules';

export type AccountListItem = {
	id: string;
	account_type: 'cash_account' | 'mortgage_account' | 'credit_card' | 'brokerage' | 'super_account';
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

export type CreateAccountInput = {
	scenarioId: string;
	accountType: AccountListItem['account_type'];
	name: string;
	startDate: number;
	openingBalance: number;
	details: Record<string, unknown>;
};

export async function getAccountsForScenario(scenarioId: string) {
	const result = await timedScenarioQuery<AccountListItem>(
		'getAccountsForScenario',
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

export async function createAccountWithHolders(
	input: CreateAccountInput & { holderAssetIds: string[] }
) {
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

export async function updateAccountInterestRate(
	userId: string,
	scenarioId: string,
	accountId: string,
	interestRate: number
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update accounts as a
			set details = jsonb_set(
				coalesce(details, '{}'::jsonb),
				'{interestRate}',
				to_jsonb(round($4::numeric, 2)),
				true
			)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
		`,
		[userId, scenarioId, accountId, interestRate]
	);
}

export async function updateAccountDetails(
	userId: string,
	scenarioId: string,
	accountId: string,
	input: {
		name: string;
		startDate: number;
		openingBalance: number;
	}
) {
	return runAuthorizedScenarioMutation(
		getPool(),
		`
			${AUTHORIZED_SCENARIO_CTE}
			update accounts as a
			set name = $4::text,
				start_date = $5::int,
				opening_balance = round($6::numeric, 2)
			from authorized_scenario
			where a.id = $3::uuid
			  and a.scenario_id = authorized_scenario.id
		`,
		[userId, scenarioId, accountId, input.name, input.startDate, input.openingBalance]
	);
}

import { randomUUID } from 'crypto';
import type { QueryResultRow } from 'pg';
import { planAssetDeletion } from '$lib/server/asset-deletion';
import {
	getPool,
	timedScenarioQuery,
	AUTHORIZED_SCENARIO_CTE,
	normalizePropertyUse,
	clearPrimaryResidenceForOtherProperties,
	roundToOneDecimal,
	type DbClient
} from './shared';
import { type ScenarioSummary, type ScenarioListItem, insertScenarioRecord, insertScenarioMember } from './scenarios';
import { type AssetListItem, type CreateAssetInput, createAsset } from './assets';
import { type AccountListItem, type CreateAccountInput, createAccount } from './accounts';
import { type AssetAccountLink, type AutoFundingRule, type AccountBalanceTarget, type AutoSweepRule, getOrCreateAssetAccount } from './funding-rules';
import { type CashflowSummary, type InsertCashflowInput, insertCashflow } from './cashflows';
import { ensureAppUser } from './users';
import type {
	CreatePersonAssetWithCashflowsInput,
	CreatePropertyAssetWithExpenseInput,
	CreateMortgageAssetWithAccountsInput,
	CreateShareAssetWithBrokerageInput,
	CreateSuperannuationAssetWithAccountInput
} from './assets';

export type ProjectionScenarioInputs = {
	assets: AssetListItem[];
	accounts: AccountListItem[];
	assetAccounts: AssetAccountLink[];
	cashflows: CashflowSummary[];
	autoFundingRules: AutoFundingRule[];
	accountBalanceTargets: AccountBalanceTarget[];
	autoSweepRules: AutoSweepRule[];
};

export type ProjectionScenarioBundle = ProjectionScenarioInputs & {
	scenario: ScenarioSummary | null;
};

export type ProjectionScenarioListBundle = ProjectionScenarioInputs & {
	scenario: ScenarioListItem;
};

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

export async function getProjectionBundleForUser(
	userId: string,
	scenarioId?: string | null
): Promise<ProjectionScenarioBundle> {
	const result = await timedScenarioQuery<
		QueryResultRow & {
			scenario: ScenarioSummary | null;
			assets: AssetListItem[];
			accounts: AccountListItem[];
			asset_accounts: AssetAccountLink[];
			cashflows: CashflowSummary[];
			auto_funding_rules: AutoFundingRule[];
			account_balance_targets: AccountBalanceTarget[];
			auto_sweep_rules: AutoSweepRule[];
		}
	>(
		'getProjectionBundleForUser',
		`
			with selected_scenario as (
				select s.id, s.name, s.created_at
				from scenarios s
				left join scenario_members sm
					on sm.scenario_id = s.id
				   and sm.user_id = $1::text
				where (sm.user_id is not null or s.created_by = $1::text)
				  and ($2::uuid is null or s.id = $2::uuid)
				order by
					case when $2::uuid is null then 1 else 0 end,
					s.created_at desc
				limit 1
			)
			select
				(select to_jsonb(scenario_row) from (select id, name from selected_scenario) as scenario_row) as scenario,
				coalesce(
					(
						select jsonb_agg(to_jsonb(asset_rows) order by asset_rows.created_at desc)
						from (
							select
								a.id,
								a.asset_type,
								a.name,
								a.start_date,
								a.details,
								a.property_id,
								a.person_id,
								a.created_at,
								'[]'::jsonb as relationships
							from assets a
							join selected_scenario ss on ss.id = a.scenario_id
						) as asset_rows
					),
					'[]'::jsonb
				) as assets,
				coalesce(
					(
						select jsonb_agg(to_jsonb(account_rows) order by account_rows.created_at desc)
						from (
							select
								a.id,
								a.account_type,
								a.name,
								a.start_date,
								a.opening_balance::double precision as opening_balance,
								a.details,
								a.created_at,
								'[]'::jsonb as relationships
							from accounts a
							join selected_scenario ss on ss.id = a.scenario_id
						) as account_rows
					),
					'[]'::jsonb
				) as accounts,
				coalesce(
					(
						select jsonb_agg(to_jsonb(asset_account_rows))
						from (
							select aa.id, aa.asset_id, aa.account_id, aa.relationship_role
							from asset_accounts aa
							join selected_scenario ss on ss.id = aa.scenario_id
							order by aa.id asc
						) as asset_account_rows
					),
					'[]'::jsonb
				) as asset_accounts,
				coalesce(
					(
						select jsonb_agg(to_jsonb(cashflow_rows) order by cashflow_rows.start_date asc, cashflow_rows.id asc)
						from (
							select
								c.id,
								c.cashflow_type,
								c.category,
								c.frequency,
								c.amount::double precision as amount,
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
							join selected_scenario ss on ss.id = c.scenario_id
							left join asset_accounts saa on saa.id = c.source_asset_account_id
							left join asset_accounts daa on daa.id = c.destination_asset_account_id
							left join assets sasset on sasset.id = saa.asset_id
							left join assets dasset on dasset.id = daa.asset_id
							left join accounts sacc on sacc.id = saa.account_id
							left join accounts dacc on dacc.id = daa.account_id
						) as cashflow_rows
					),
					'[]'::jsonb
				) as cashflows,
				coalesce(
					(
						select jsonb_agg(to_jsonb(auto_funding_rows) order by auto_funding_rows.target_account_id asc, auto_funding_rows.priority_order asc, auto_funding_rows.created_at asc)
						from (
							select
								afr.id,
								afr.scenario_id,
								afr.source_account_id,
								afr.target_account_id,
								afr.priority_order,
								afr.enabled,
								afr.min_target_balance::double precision as min_target_balance,
								afr.created_at,
								afr.updated_at
							from auto_funding_rules afr
							join selected_scenario ss on ss.id = afr.scenario_id
						) as auto_funding_rows
					),
					'[]'::jsonb
				) as auto_funding_rules,
				coalesce(
					(
						select jsonb_agg(to_jsonb(account_balance_target_rows) order by account_balance_target_rows.created_at asc)
						from (
							select
								abt.id,
								abt.scenario_id,
								abt.account_id,
								abt.min_balance::double precision as min_balance,
								abt.max_balance::double precision as max_balance,
								abt.enabled,
								abt.created_at,
								abt.updated_at
							from account_balance_targets abt
							join selected_scenario ss on ss.id = abt.scenario_id
						) as account_balance_target_rows
					),
					'[]'::jsonb
				) as account_balance_targets,
				coalesce(
					(
						select jsonb_agg(to_jsonb(auto_sweep_rows) order by auto_sweep_rows.source_account_id asc, auto_sweep_rows.priority_order asc, auto_sweep_rows.created_at asc)
						from (
							select
								asr.id,
								asr.scenario_id,
								asr.source_account_id,
								asr.destination_account_id,
								asr.priority_order,
								asr.enabled,
								asr.created_at,
								asr.updated_at
							from auto_sweep_rules asr
							join selected_scenario ss on ss.id = asr.scenario_id
						) as auto_sweep_rows
					),
					'[]'::jsonb
				) as auto_sweep_rules
		`,
		[userId, scenarioId ?? null]
	);

	const row = result.rows[0];
	return {
		scenario: row?.scenario ?? null,
		assets: row?.assets ?? [],
		accounts: row?.accounts ?? [],
		assetAccounts: row?.asset_accounts ?? [],
		cashflows: row?.cashflows ?? [],
		autoFundingRules: row?.auto_funding_rules ?? [],
		accountBalanceTargets: row?.account_balance_targets ?? [],
		autoSweepRules: row?.auto_sweep_rules ?? []
	};
}

export async function getProjectionBundlesForUser(
	userId: string
): Promise<ProjectionScenarioListBundle[]> {
	const result = await timedScenarioQuery<
		QueryResultRow & {
			id: string;
			name: string;
			created_at: string;
			is_owner: boolean;
			assets: AssetListItem[];
			accounts: AccountListItem[];
			asset_accounts: AssetAccountLink[];
			cashflows: CashflowSummary[];
			auto_funding_rules: AutoFundingRule[];
			account_balance_targets: AccountBalanceTarget[];
			auto_sweep_rules: AutoSweepRule[];
		}
	>(
		'getProjectionBundlesForUser',
		`
			with accessible_scenarios as (
				select distinct s.id, s.name, s.created_at, (s.created_by = $1::text) as is_owner
				from scenarios s
				left join scenario_members sm
					on sm.scenario_id = s.id
				   and sm.user_id = $1::text
				where sm.user_id is not null
				   or s.created_by = $1::text
			)
			select
				scenario.id,
				scenario.name,
				scenario.created_at,
				scenario.is_owner,
				coalesce(
					(
						select jsonb_agg(to_jsonb(asset_rows) order by asset_rows.created_at desc)
						from (
							select
								a.id,
								a.asset_type,
								a.name,
								a.start_date,
								a.details,
								a.property_id,
								a.person_id,
								a.created_at,
								'[]'::jsonb as relationships
							from assets a
							where a.scenario_id = scenario.id
						) as asset_rows
					),
					'[]'::jsonb
				) as assets,
				coalesce(
					(
						select jsonb_agg(to_jsonb(account_rows) order by account_rows.created_at desc)
						from (
							select
								a.id,
								a.account_type,
								a.name,
								a.start_date,
								a.opening_balance::double precision as opening_balance,
								a.details,
								a.created_at,
								'[]'::jsonb as relationships
							from accounts a
							where a.scenario_id = scenario.id
						) as account_rows
					),
					'[]'::jsonb
				) as accounts,
				coalesce(
					(
						select jsonb_agg(to_jsonb(asset_account_rows) order by asset_account_rows.id asc)
						from (
							select aa.id, aa.asset_id, aa.account_id, aa.relationship_role
							from asset_accounts aa
							where aa.scenario_id = scenario.id
						) as asset_account_rows
					),
					'[]'::jsonb
				) as asset_accounts,
				coalesce(
					(
						select jsonb_agg(to_jsonb(cashflow_rows) order by cashflow_rows.start_date asc, cashflow_rows.id asc)
						from (
							select
								c.id,
								c.cashflow_type,
								c.category,
								c.frequency,
								c.amount::double precision as amount,
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
							where c.scenario_id = scenario.id
						) as cashflow_rows
					),
					'[]'::jsonb
				) as cashflows,
				coalesce(
					(
						select jsonb_agg(to_jsonb(auto_funding_rows) order by auto_funding_rows.target_account_id asc, auto_funding_rows.priority_order asc, auto_funding_rows.created_at asc)
						from (
							select
								afr.id,
								afr.scenario_id,
								afr.source_account_id,
								afr.target_account_id,
								afr.priority_order,
								afr.enabled,
								afr.min_target_balance::double precision as min_target_balance,
								afr.created_at,
								afr.updated_at
							from auto_funding_rules afr
							where afr.scenario_id = scenario.id
						) as auto_funding_rows
					),
					'[]'::jsonb
				) as auto_funding_rules,
				coalesce(
					(
						select jsonb_agg(to_jsonb(account_balance_target_rows) order by account_balance_target_rows.created_at asc)
						from (
							select
								abt.id,
								abt.scenario_id,
								abt.account_id,
								abt.min_balance::double precision as min_balance,
								abt.max_balance::double precision as max_balance,
								abt.enabled,
								abt.created_at,
								abt.updated_at
							from account_balance_targets abt
							where abt.scenario_id = scenario.id
						) as account_balance_target_rows
					),
					'[]'::jsonb
				) as account_balance_targets,
				coalesce(
					(
						select jsonb_agg(to_jsonb(auto_sweep_rows) order by auto_sweep_rows.source_account_id asc, auto_sweep_rows.priority_order asc, auto_sweep_rows.created_at asc)
						from (
							select
								asr.id,
								asr.scenario_id,
								asr.source_account_id,
								asr.destination_account_id,
								asr.priority_order,
								asr.enabled,
								asr.created_at,
								asr.updated_at
							from auto_sweep_rules asr
							where asr.scenario_id = scenario.id
						) as auto_sweep_rows
					),
					'[]'::jsonb
				) as auto_sweep_rules
			from accessible_scenarios scenario
			order by scenario.created_at desc
		`,
		[userId]
	);

	return result.rows.map((row) => ({
		scenario: {
			id: row.id,
			name: row.name,
			created_at: row.created_at,
			is_owner: row.is_owner
		},
		assets: row.assets ?? [],
		accounts: row.accounts ?? [],
		assetAccounts: row.asset_accounts ?? [],
		cashflows: row.cashflows ?? [],
		autoFundingRules: row.auto_funding_rules ?? [],
		accountBalanceTargets: row.account_balance_targets ?? [],
		autoSweepRules: row.auto_sweep_rules ?? []
	}));
}

export async function deleteAssetForScenario(userId: string, scenarioId: string, assetId: string) {
	const client = await getPool().connect();
	try {
		await client.query('begin');
		const authorizedScenario = await client.query<{ id: string }>(
			`
				${AUTHORIZED_SCENARIO_CTE}
				select id from authorized_scenario
			`,
			[userId, scenarioId]
		);
		if ((authorizedScenario.rowCount ?? 0) === 0) {
			await client.query('rollback');
			return false;
		}

		const assetsResult = await client.query<{
			id: string;
			asset_type: 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';
			property_id: string | null;
			person_id: string | null;
			name: string;
		}>(
			`
				select id, asset_type, property_id, person_id, name
				from assets
				where scenario_id = $1::uuid
			`,
			[scenarioId]
		);
		const accountsResult = await client.query<{
			id: string;
			account_type:
				| 'cash_account'
				| 'mortgage_account'
				| 'credit_card'
				| 'brokerage'
				| 'super_account';
			name: string;
		}>(
			`
				select id, account_type, name
				from accounts
				where scenario_id = $1::uuid
			`,
			[scenarioId]
		);
		const assetAccountsResult = await client.query<{
			id: string;
			asset_id: string;
			account_id: string;
			relationship_role: 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';
		}>(
			`
				select id, asset_id, account_id, relationship_role
				from asset_accounts
				where scenario_id = $1::uuid
			`,
			[scenarioId]
		);

		const deletionPlan = planAssetDeletion({
			assetId,
			assets: assetsResult.rows,
			accounts: accountsResult.rows,
			assetAccounts: assetAccountsResult.rows
		});

		if (deletionPlan.assetAccountIdsToDelete.length > 0) {
			await client.query(
				`
					delete from cashflows
					where scenario_id = $1::uuid
					  and (
						source_asset_account_id = any($2::uuid[])
						or destination_asset_account_id = any($2::uuid[])
					  )
				`,
				[scenarioId, deletionPlan.assetAccountIdsToDelete]
			);
		}

		if (deletionPlan.fixedAccountIdsToDelete.length > 0) {
			await client.query(
				`
					delete from accounts
					where scenario_id = $1::uuid
					  and id = any($2::uuid[])
				`,
				[scenarioId, deletionPlan.fixedAccountIdsToDelete]
			);
		}

		await client.query(
			`
				delete from assets
				where scenario_id = $1::uuid
				  and id = $2::uuid
			`,
			[scenarioId, assetId]
		);

		await client.query('commit');
		return true;
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
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
		[
			scenarioId,
			input.accountName,
			input.accountInterestRate,
			input.openingBalance,
			input.startDate
		]
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

export async function createScenarioWithPerson(input: CreateScenarioWithPersonInput) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		await ensureAppUser(input.userId, undefined, client);

		const scenarioId = await insertScenarioRecord(client, input.scenarioName, input.userId);

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

export async function cloneScenarioForUser(input: {
	userId: string;
	sourceScenarioId: string;
	scenarioName: string;
}) {
	const client = await getPool().connect();
	try {
		await client.query('begin');

		await ensureAppUser(input.userId, undefined, client);

		const sourceScenarioResult = await client.query<{ id: string }>(
			`
				select s.id
				from scenarios s
				left join scenario_members sm
					on sm.scenario_id = s.id
				   and sm.user_id = $1::text
				where s.id = $2::uuid
				  and (sm.user_id is not null or s.created_by = $1::text)
				limit 1
			`,
			[input.userId, input.sourceScenarioId]
		);

		if (!sourceScenarioResult.rows[0]?.id) {
			throw new Error('Scenario not found.');
		}

		const scenarioId = await insertScenarioRecord(client, input.scenarioName, input.userId);
		await insertScenarioMember(client, scenarioId, input.userId);

		const assetsResult = await client.query<
			QueryResultRow & {
				id: string;
				asset_type: AssetListItem['asset_type'];
				name: string;
				start_date: number;
				details: Record<string, unknown>;
				property_id: string | null;
				person_id: string | null;
			}
		>(
			`
				select id, asset_type, name, start_date, details, property_id, person_id
				from assets
				where scenario_id = $1::uuid
				order by created_at asc, id asc
			`,
			[input.sourceScenarioId]
		);
		const accountsResult = await client.query<
			QueryResultRow & {
				id: string;
				account_type: AccountListItem['account_type'];
				name: string;
				start_date: number;
				opening_balance: number;
				details: Record<string, unknown>;
			}
		>(
			`
				select id, account_type, name, start_date, opening_balance::double precision as opening_balance, details
				from accounts
				where scenario_id = $1::uuid
				order by created_at asc, id asc
			`,
			[input.sourceScenarioId]
		);
		const assetAccountsResult = await client.query<AssetAccountLink>(
			`
				select id, asset_id, account_id, relationship_role
				from asset_accounts
				where scenario_id = $1::uuid
				order by id asc
			`,
			[input.sourceScenarioId]
		);
		const cashflowsResult = await client.query<
			QueryResultRow & {
				id: string;
				cashflow_type: 'expense' | 'income' | 'transfer';
				frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
				category: InsertCashflowInput['category'];
				amount: number;
				inflation_affected: boolean;
				start_date: number;
				end_date: number | null;
				source_asset_account_id: string | null;
				destination_asset_account_id: string | null;
				description: string;
			}
		>(
			`
				select
					id,
					cashflow_type,
					frequency,
					category,
					amount::double precision as amount,
					inflation_affected,
					start_date,
					end_date,
					source_asset_account_id,
					destination_asset_account_id,
					description
				from cashflows
				where scenario_id = $1::uuid
				order by created_at asc, id asc
			`,
			[input.sourceScenarioId]
		);
		const autoFundingRulesResult = await client.query<AutoFundingRule>(
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
				order by target_account_id asc, priority_order asc, created_at asc, id asc
			`,
			[input.sourceScenarioId]
		);
		const accountBalanceTargetsResult = await client.query<AccountBalanceTarget>(
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
				order by created_at asc, id asc
			`,
			[input.sourceScenarioId]
		);
		const autoSweepRulesResult = await client.query<AutoSweepRule>(
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
				order by source_account_id asc, priority_order asc, created_at asc, id asc
			`,
			[input.sourceScenarioId]
		);

		const assetIdMap = new Map(assetsResult.rows.map((asset) => [asset.id, randomUUID()] as const));
		const unlinkedAssets = assetsResult.rows.filter(
			(asset) => asset.asset_type !== 'mortgage' && asset.asset_type !== 'superannuation'
		);
		const linkedAssets = assetsResult.rows.filter(
			(asset) => asset.asset_type === 'mortgage' || asset.asset_type === 'superannuation'
		);

		const insertClonedAsset = async (
			asset: (typeof assetsResult.rows)[number],
			linkedIds: { propertyId?: string | null; personId?: string | null }
		) => {
			const nextAssetId = assetIdMap.get(asset.id);
			if (!nextAssetId) {
				throw new Error('Unable to allocate cloned asset id.');
			}

			await client.query(
				`
					insert into assets (
						id,
						scenario_id,
						asset_type,
						name,
						start_date,
						details,
						property_id,
						person_id
					)
					values (
						$1::uuid,
						$2::uuid,
						$3::asset_type,
						$4::text,
						$5::int,
						$6::jsonb,
						$7::uuid,
						$8::uuid
					)
				`,
				[
					nextAssetId,
					scenarioId,
					asset.asset_type,
					asset.name,
					asset.start_date,
					asset.details,
					linkedIds.propertyId ?? null,
					linkedIds.personId ?? null
				]
			);
		};

		for (const asset of unlinkedAssets) {
			await insertClonedAsset(asset, {});
		}

		for (const asset of linkedAssets) {
			await insertClonedAsset(asset, {
				propertyId: asset.property_id ? (assetIdMap.get(asset.property_id) ?? null) : null,
				personId: asset.person_id ? (assetIdMap.get(asset.person_id) ?? null) : null
			});
		}

		const accountIdMap = new Map<string, string>();
		for (const account of accountsResult.rows) {
			const nextAccountId = await createAccount(
				{
					scenarioId,
					accountType: account.account_type,
					name: account.name,
					startDate: account.start_date,
					openingBalance: account.opening_balance,
					details: account.details
				},
				client
			);
			accountIdMap.set(account.id, nextAccountId);
		}

		const assetAccountIdMap = new Map<string, string>();
		for (const assetAccount of assetAccountsResult.rows) {
			const nextAssetId = assetIdMap.get(assetAccount.asset_id);
			const nextAccountId = accountIdMap.get(assetAccount.account_id);
			if (!nextAssetId || !nextAccountId) {
				throw new Error('Unable to clone asset account relationship.');
			}
			const nextAssetAccountId = await getOrCreateAssetAccount(client, {
				scenarioId,
				assetId: nextAssetId,
				accountId: nextAccountId,
				role: assetAccount.relationship_role
			});
			assetAccountIdMap.set(assetAccount.id, nextAssetAccountId);
		}

		for (const cashflow of cashflowsResult.rows) {
			await insertCashflow(client, {
				scenarioId,
				type: cashflow.cashflow_type,
				frequency: cashflow.frequency,
				category: cashflow.category,
				amount: cashflow.amount,
				inflationAffected: cashflow.inflation_affected,
				startDate: cashflow.start_date,
				endDate: cashflow.end_date,
				sourceAssetAccountId: cashflow.source_asset_account_id
					? (assetAccountIdMap.get(cashflow.source_asset_account_id) ?? null)
					: null,
				destinationAssetAccountId: cashflow.destination_asset_account_id
					? (assetAccountIdMap.get(cashflow.destination_asset_account_id) ?? null)
					: null,
				description: cashflow.description,
				createdBy: input.userId
			});
		}

		for (const rule of autoFundingRulesResult.rows) {
			const nextSourceAccountId = accountIdMap.get(rule.source_account_id);
			const nextTargetAccountId = accountIdMap.get(rule.target_account_id);
			if (!nextSourceAccountId || !nextTargetAccountId) {
				throw new Error('Unable to clone auto-funding rule.');
			}
			await client.query(
				`
					insert into auto_funding_rules (
						scenario_id,
						source_account_id,
						target_account_id,
						priority_order,
						enabled,
						min_target_balance
					)
					values ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::boolean, $6::numeric)
				`,
				[
					scenarioId,
					nextSourceAccountId,
					nextTargetAccountId,
					rule.priority_order,
					rule.enabled,
					rule.min_target_balance
				]
			);
		}

		for (const target of accountBalanceTargetsResult.rows) {
			const nextAccountId = accountIdMap.get(target.account_id);
			if (!nextAccountId) {
				throw new Error('Unable to clone account balance target.');
			}
			await client.query(
				`
					insert into account_balance_targets (
						scenario_id,
						account_id,
						min_balance,
						max_balance,
						enabled
					)
					values ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::boolean)
				`,
				[scenarioId, nextAccountId, target.min_balance, target.max_balance, target.enabled]
			);
		}

		for (const rule of autoSweepRulesResult.rows) {
			const nextSourceAccountId = accountIdMap.get(rule.source_account_id);
			const nextDestinationAccountId = accountIdMap.get(rule.destination_account_id);
			if (!nextSourceAccountId || !nextDestinationAccountId) {
				throw new Error('Unable to clone auto-sweep rule.');
			}
			await client.query(
				`
					insert into auto_sweep_rules (
						scenario_id,
						source_account_id,
						destination_account_id,
						priority_order,
						enabled
					)
					values ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::boolean)
				`,
				[
					scenarioId,
					nextSourceAccountId,
					nextDestinationAccountId,
					rule.priority_order,
					rule.enabled
				]
			);
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
		const propertyUse = normalizePropertyUse(input.propertyUse);
		if (propertyUse === 'primary_residence') {
			await clearPrimaryResidenceForOtherProperties(client, input.scenarioId);
		}

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
					propertyUse,
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
		const capitalGrowthRate = roundToOneDecimal(input.capitalGrowthRate);
		const dividendYield = roundToOneDecimal(input.dividendYield);

		const assetId = await createAsset(
			{
				scenarioId: input.scenarioId,
				assetType: 'shares',
				name: input.name,
				startDate: input.startDate,
				details: {
					capitalGrowthRate,
					dividendYield,
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

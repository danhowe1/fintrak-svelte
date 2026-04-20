import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	createAutoFundingRule,
	deleteAutoFundingRule,
	upsertAccountBalanceTarget,
	deleteAccountBalanceTarget,
	createAutoSweepRule,
	deleteAutoSweepRule,
	reorderAutoFundingRules,
	reorderAutoSweepRules,
	getProjectionBundleForUser
} from '$lib/server/database';
import { buildAssetByAccountId, buildOffsetAccountIds } from '$lib/dashboard/account-validation';

export const fundingActions = {
	upsertAutoFundingRule: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const sourceAccountId = String(formData.get('sourceAccountId') ?? '');
		const targetAccountId = String(formData.get('targetAccountId') ?? '');
		if (
			!scenarioId ||
			!sourceAccountId ||
			!targetAccountId ||
			sourceAccountId === targetAccountId
		) {
			return fail(400, { error: 'Invalid auto-funding rule input.' });
		}
		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const { accounts, assetAccounts, assets } = projectionBundle;
		const sourceAccount = accounts.find((account) => account.id === sourceAccountId);
		const targetAccount = accounts.find((account) => account.id === targetAccountId);
		const shareAssetByAccountId = buildAssetByAccountId(assetAccounts, assets, 'shares');
		const superAssetByAccountId = buildAssetByAccountId(assetAccounts, assets, 'superannuation');
		const offsetAccountIds = buildOffsetAccountIds(assetAccounts);
		const isAllowedAutoFundingSource = (accountId: string, accountType: string | undefined) =>
			accountType === 'cash_account' ||
			offsetAccountIds.has(accountId) ||
			(accountType === 'brokerage' && shareAssetByAccountId.has(accountId)) ||
			(accountType === 'super_account' && superAssetByAccountId.has(accountId));
		if (
			!sourceAccount ||
			!targetAccount ||
			!isAllowedAutoFundingSource(sourceAccountId, sourceAccount.account_type) ||
			(targetAccount.account_type !== 'cash_account' && !offsetAccountIds.has(targetAccountId))
		) {
			return fail(400, {
				error:
					'Auto-funding source must be a cash account, offset account, shares brokerage account, or eligible super account. Target must be a cash or offset account.'
			});
		}
		await createAutoFundingRule({
			userId,
			scenarioId,
			sourceAccountId,
			targetAccountId,
			enabled: true,
			minTargetBalance: 0
		});
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, autoFundingRules: nextBundle.autoFundingRules };
	},

	deleteAutoFundingRule: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const ruleId = String(formData.get('ruleId') ?? '');
		if (!scenarioId || !ruleId) {
			return fail(400, { error: 'Invalid auto-funding rule input.' });
		}
		const deleted = await deleteAutoFundingRule(userId, scenarioId, ruleId);
		if (!deleted) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, autoFundingRules: nextBundle.autoFundingRules };
	},

	updateAccountBalanceTarget: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const accountId = String(formData.get('accountId') ?? '');
		const minBalanceRaw = Number(formData.get('minBalance'));
		const maxBalanceRaw = String(formData.get('maxBalance') ?? '').trim();
		const maxBalance = maxBalanceRaw.length > 0 ? Number(maxBalanceRaw) : null;
		if (
			!scenarioId ||
			!accountId ||
			!Number.isFinite(minBalanceRaw) ||
			minBalanceRaw < 0 ||
			(maxBalance !== null && (!Number.isFinite(maxBalance) || maxBalance < 0))
		) {
			return fail(400, { error: 'Invalid balance target input.' });
		}
		if (maxBalance !== null && maxBalance < minBalanceRaw) {
			return fail(400, { error: 'Cap must be greater than or equal to reserve.' });
		}
		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		if (!projectionBundle.accounts.some((account) => account.id === accountId)) {
			return fail(400, { error: 'Account not found in this scenario.' });
		}
		const target = await upsertAccountBalanceTarget({
			userId,
			scenarioId,
			accountId,
			minBalance: Math.round(minBalanceRaw * 100) / 100,
			maxBalance: maxBalance === null ? null : Math.round(maxBalance * 100) / 100,
			enabled: true
		});
		if (!target) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, accountBalanceTargets: nextBundle.accountBalanceTargets };
	},

	deleteAccountBalanceTarget: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const accountId = String(formData.get('accountId') ?? '');
		if (!scenarioId || !accountId) {
			return fail(400, { error: 'Invalid balance target input.' });
		}
		const deleted = await deleteAccountBalanceTarget(userId, scenarioId, accountId);
		if (!deleted) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, accountBalanceTargets: nextBundle.accountBalanceTargets };
	},

	upsertAutoSweepRule: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const sourceAccountId = String(formData.get('sourceAccountId') ?? '');
		const destinationAccountId = String(formData.get('destinationAccountId') ?? '');
		if (
			!scenarioId ||
			!sourceAccountId ||
			!destinationAccountId ||
			sourceAccountId === destinationAccountId
		) {
			return fail(400, { error: 'Invalid auto-sweep rule input.' });
		}
		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const { accounts, assetAccounts, assets } = projectionBundle;
		const accountsById = new Map(accounts.map((account) => [account.id, account]));
		const shareAssetByAccountId = buildAssetByAccountId(assetAccounts, assets, 'shares');
		const superAssetByAccountId = buildAssetByAccountId(assetAccounts, assets, 'superannuation');
		const isAllowedSweepAccount = (accountId: string, accountType: string | undefined) =>
			accountType === 'cash_account' ||
			(accountType === 'brokerage' && shareAssetByAccountId.has(accountId)) ||
			(accountType === 'super_account' && superAssetByAccountId.has(accountId));
		const sourceAccount = accountsById.get(sourceAccountId);
		const destinationAccount = accountsById.get(destinationAccountId);
		if (
			!sourceAccount ||
			!destinationAccount ||
			!isAllowedSweepAccount(sourceAccountId, sourceAccount.account_type) ||
			!isAllowedSweepAccount(destinationAccountId, destinationAccount.account_type)
		) {
			return fail(400, {
				error:
					'Auto-sweep accounts must be cash accounts, shares brokerage accounts, or eligible super accounts.'
			});
		}
		await createAutoSweepRule({
			userId,
			scenarioId,
			sourceAccountId,
			destinationAccountId,
			enabled: true
		});
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, autoSweepRules: nextBundle.autoSweepRules };
	},

	reorderAutoFundingRules: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const targetAccountId = String(formData.get('targetAccountId') ?? '');
		const ruleIdsCsv = String(formData.get('ruleIds') ?? '');
		const ruleIds = ruleIdsCsv
			.split(',')
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (!scenarioId || !targetAccountId || ruleIds.length === 0) {
			return fail(400, { error: 'Invalid auto-funding reorder input.' });
		}
		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const existingRuleIds = projectionBundle.autoFundingRules
			.filter((rule) => rule.target_account_id === targetAccountId)
			.map((rule) => rule.id);
		if (
			existingRuleIds.length !== ruleIds.length ||
			existingRuleIds.some((id) => !ruleIds.includes(id))
		) {
			return fail(400, { error: 'Invalid rule ordering payload.' });
		}
		try {
			await reorderAutoFundingRules(scenarioId, targetAccountId, ruleIds);
		} catch (error) {
			const message =
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: 'Unable to reorder reserve funding rules.';
			const status = message === 'Invalid rule ordering payload.' ? 400 : 500;
			return fail(status, { error: message });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, autoFundingRules: nextBundle.autoFundingRules };
	},

	reorderAutoSweepRules: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const sourceAccountId = String(formData.get('sourceAccountId') ?? '');
		const ruleIdsCsv = String(formData.get('ruleIds') ?? '');
		const ruleIds = ruleIdsCsv
			.split(',')
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (!scenarioId || !sourceAccountId || ruleIds.length === 0) {
			return fail(400, { error: 'Invalid auto-sweep reorder input.' });
		}
		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const existingRuleIds = projectionBundle.autoSweepRules
			.filter((rule) => rule.source_account_id === sourceAccountId)
			.map((rule) => rule.id);
		if (
			existingRuleIds.length !== ruleIds.length ||
			existingRuleIds.some((id) => !ruleIds.includes(id))
		) {
			return fail(400, { error: 'Invalid auto-sweep reorder input.' });
		}
		await reorderAutoSweepRules(scenarioId, sourceAccountId, ruleIds);
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, autoSweepRules: nextBundle.autoSweepRules };
	},

	deleteAutoSweepRule: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const ruleId = String(formData.get('ruleId') ?? '');
		if (!scenarioId || !ruleId) {
			return fail(400, { error: 'Invalid auto-sweep rule input.' });
		}
		const deleted = await deleteAutoSweepRule(userId, scenarioId, ruleId);
		if (!deleted) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, autoSweepRules: nextBundle.autoSweepRules };
	}
};

import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	createCashflow,
	deleteCashflow,
	updateCashflow,
	updateCashflowAmount,
	updateCashflowInflationAffected,
	getOrCreateHeldInAssetAccount,
	getProjectionBundleForUser
} from '$lib/server/database';
import { isValidYearMonthInput, requireYearMonthInput } from '$lib/yearMonth';
import { buildAssetByAccountId } from '$lib/dashboard/account-validation';

const CASH_ACCOUNT_SELECTION_PREFIX = 'account:';

const parseSelectedAccountId = (value: string) =>
	value.startsWith(CASH_ACCOUNT_SELECTION_PREFIX)
		? value.slice(CASH_ACCOUNT_SELECTION_PREFIX.length)
		: null;

function resolveTransferCategory(
	sourceType: string | undefined,
	destinationType: string | undefined,
	shareAssetByAccountId: Map<string, string>,
	sourceAccountId: string,
	destinationAccountId: string
): 'shares_purchase' | 'shares_sale' | 'transfer' {
	if (
		sourceType === 'cash_account' &&
		destinationType === 'brokerage' &&
		shareAssetByAccountId.has(destinationAccountId)
	) {
		return 'shares_purchase';
	}
	if (
		sourceType === 'brokerage' &&
		destinationType === 'cash_account' &&
		shareAssetByAccountId.has(sourceAccountId)
	) {
		return 'shares_sale';
	}
	return 'transfer';
}

async function resolveAssetAccountId(
	assetAccountId: string,
	assetId: string,
	assetType: string,
	scenarioId: string,
	assetAccounts: Awaited<ReturnType<typeof getProjectionBundleForUser>>['assetAccounts'],
	accounts: Awaited<ReturnType<typeof getProjectionBundleForUser>>['accounts']
): Promise<string | null> {
	const direct =
		assetAccounts.find(
			(link) =>
				link.id === assetAccountId &&
				link.asset_id === assetId &&
				link.relationship_role === 'held_in'
		)?.id ?? null;
	if (direct) return direct;

	if (assetType !== 'person' && assetType !== 'property') return null;

	const selectedAccountId = parseSelectedAccountId(assetAccountId);
	const selectedAccount = selectedAccountId
		? accounts.find((account) => account.id === selectedAccountId)
		: null;
	if (selectedAccount?.account_type !== 'cash_account') return null;

	return getOrCreateHeldInAssetAccount({ scenarioId, assetId, accountId: selectedAccount.id });
}

function validateCashflowCategory(
	assetType: string,
	type: string,
	category: string
): string | null {
	if (assetType === 'person') {
		if (type === 'expense' && category !== 'living_expenses') {
			return 'Invalid category for person expense.';
		}
		if (type === 'income' && category !== 'employment_income' && category !== 'misc_income') {
			return 'Invalid category for person income.';
		}
	}
	if (assetType === 'property') {
		if (type === 'expense' && category !== 'asset_ownership') {
			return 'Invalid category for property expense.';
		}
		if (type === 'income' && category !== 'rental_income') {
			return 'Invalid category for property income.';
		}
	}
	return null;
}

export const cashflowActions = {
	updateCashflowAmount: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		const amount = Number(formData.get('amount'));
		if (!scenarioId || !cashflowId || !Number.isFinite(amount)) {
			return fail(400, { error: 'Invalid input.' });
		}
		const updated = await updateCashflowAmount(userId, scenarioId, cashflowId, amount);
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	createTransferCashflow: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const sourceAccountId = String(formData.get('sourceAccountId') ?? '');
		const destinationAccountId = String(formData.get('destinationAccountId') ?? '');
		const frequency = String(formData.get('frequency') ?? '');
		const amount = Number(formData.get('amount'));
		const inflationAffected = formData.get('inflationAffected') === 'on';
		const startMonth = String(formData.get('startDate') ?? '');
		const endMonth = String(formData.get('endDate') ?? '');
		const description = String(formData.get('description') ?? '').trim();

		if (
			!scenarioId ||
			!sourceAccountId ||
			!destinationAccountId ||
			sourceAccountId === destinationAccountId ||
			(frequency !== 'monthly' &&
				frequency !== 'quarterly' &&
				frequency !== 'annually' &&
				frequency !== 'one_time') ||
			!Number.isFinite(amount) ||
			amount <= 0 ||
			!isValidYearMonthInput(startMonth) ||
			(endMonth.trim().length > 0 && !isValidYearMonthInput(endMonth))
		) {
			return fail(400, { error: 'Invalid transfer input.' });
		}
		const transferFrequency = frequency as 'monthly' | 'quarterly' | 'annually' | 'one_time';

		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const { assetAccounts, accounts, assets } = projectionBundle;
		const sourceLink =
			assetAccounts.find(
				(link) => link.account_id === sourceAccountId && link.relationship_role === 'held_in'
			) ?? assetAccounts.find((link) => link.account_id === sourceAccountId);
		const destinationLink =
			assetAccounts.find(
				(link) => link.account_id === destinationAccountId && link.relationship_role === 'held_in'
			) ?? assetAccounts.find((link) => link.account_id === destinationAccountId);
		if (!sourceLink || !destinationLink) {
			return fail(400, { error: 'Account linkage is invalid for transfer.' });
		}
		const sourceAccount = accounts.find((account) => account.id === sourceAccountId) ?? null;
		const destinationAccount =
			accounts.find((account) => account.id === destinationAccountId) ?? null;
		const shareAssetByAccountId = buildAssetByAccountId(assetAccounts, assets, 'shares');
		const isAllowedTransferAccount = (accountId: string, accountType: string | undefined) =>
			accountType === 'cash_account' ||
			accountType === 'super_account' ||
			(accountType === 'brokerage' && shareAssetByAccountId.has(accountId));
		if (
			!isAllowedTransferAccount(sourceAccountId, sourceAccount?.account_type) ||
			!isAllowedTransferAccount(destinationAccountId, destinationAccount?.account_type)
		) {
			return fail(400, {
				error:
					'Transfers currently only support cash accounts, super accounts, and shares brokerage accounts.'
			});
		}
		const cashflowCategory = resolveTransferCategory(
			sourceAccount?.account_type,
			destinationAccount?.account_type,
			shareAssetByAccountId,
			sourceAccountId,
			destinationAccountId
		);

		try {
			await createCashflow({
				scenarioId,
				type: 'transfer',
				frequency: transferFrequency,
				category: cashflowCategory,
				amount,
				inflationAffected,
				startDate: requireYearMonthInput(startMonth),
				endDate:
					transferFrequency === 'one_time'
						? null
						: endMonth.trim().length > 0
							? requireYearMonthInput(endMonth)
							: null,
				sourceAssetAccountId: sourceLink.id,
				destinationAssetAccountId: destinationLink.id,
				description,
				createdBy: userId
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to create transfer.';
			if (message.includes('invalid input value for enum cashflow_category')) {
				return fail(500, {
					error:
						'Database category enum is out of date. Please run migration 0006_align_cashflow_categories.sql.'
				});
			}
			return fail(500, { error: message });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, cashflows: nextBundle.cashflows };
	},

	updateTransferInflationAffected: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		const inflationAffected = formData.get('inflationAffected') === 'on';
		if (!scenarioId || !cashflowId) {
			return fail(400, { error: 'Invalid input.' });
		}
		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const cashflow = projectionBundle.cashflows.find((item) => item.id === cashflowId);
		if (!cashflow || cashflow.cashflow_type !== 'transfer') {
			return fail(400, { error: 'Transfer not found.' });
		}
		const updated = await updateCashflowInflationAffected(
			userId,
			scenarioId,
			cashflowId,
			inflationAffected
		);
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, cashflows: nextBundle.cashflows };
	},

	updateTransferCashflow: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		const sourceAccountId = String(formData.get('sourceAccountId') ?? '');
		const destinationAccountId = String(formData.get('destinationAccountId') ?? '');
		const amount = Number(formData.get('amount'));
		const frequency = String(formData.get('frequency') ?? '');
		const startMonth = String(formData.get('startDate') ?? '');
		const endMonth = String(formData.get('endDate') ?? '');
		const description = String(formData.get('description') ?? '').trim();

		if (
			!scenarioId ||
			!cashflowId ||
			!sourceAccountId ||
			!destinationAccountId ||
			sourceAccountId === destinationAccountId ||
			!Number.isFinite(amount) ||
			amount <= 0 ||
			(frequency !== 'monthly' &&
				frequency !== 'quarterly' &&
				frequency !== 'annually' &&
				frequency !== 'one_time') ||
			!isValidYearMonthInput(startMonth) ||
			(endMonth.trim().length > 0 && !isValidYearMonthInput(endMonth))
		) {
			return fail(400, { error: 'Invalid transfer input.' });
		}

		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const transfer = projectionBundle.cashflows.find((item) => item.id === cashflowId);
		if (!transfer || transfer.cashflow_type !== 'transfer') {
			return fail(400, { error: 'Transfer not found.' });
		}
		const { assetAccounts, accounts, assets } = projectionBundle;
		const sourceLink =
			assetAccounts.find(
				(link) => link.account_id === sourceAccountId && link.relationship_role === 'held_in'
			) ?? assetAccounts.find((link) => link.account_id === sourceAccountId);
		const destinationLink =
			assetAccounts.find(
				(link) => link.account_id === destinationAccountId && link.relationship_role === 'held_in'
			) ?? assetAccounts.find((link) => link.account_id === destinationAccountId);
		if (!sourceLink || !destinationLink) {
			return fail(400, { error: 'Account linkage is invalid for transfer.' });
		}
		const sourceAccount = accounts.find((account) => account.id === sourceAccountId) ?? null;
		const destinationAccount =
			accounts.find((account) => account.id === destinationAccountId) ?? null;
		const shareAssetByAccountId = buildAssetByAccountId(assetAccounts, assets, 'shares');
		const isAllowedTransferAccount = (accountId: string, accountType: string | undefined) =>
			accountType === 'cash_account' ||
			accountType === 'super_account' ||
			(accountType === 'brokerage' && shareAssetByAccountId.has(accountId));
		if (
			!isAllowedTransferAccount(sourceAccountId, sourceAccount?.account_type) ||
			!isAllowedTransferAccount(destinationAccountId, destinationAccount?.account_type)
		) {
			return fail(400, {
				error:
					'Transfers currently only support cash accounts, super accounts, and shares brokerage accounts.'
			});
		}
		const transferCategory = resolveTransferCategory(
			sourceAccount?.account_type,
			destinationAccount?.account_type,
			shareAssetByAccountId,
			sourceAccountId,
			destinationAccountId
		);
		const updated = await updateCashflow({
			userId,
			scenarioId,
			cashflowId,
			type: 'transfer',
			frequency: frequency as 'monthly' | 'quarterly' | 'annually' | 'one_time',
			category: transferCategory,
			amount,
			inflationAffected: transfer.inflation_affected,
			startDate: requireYearMonthInput(startMonth),
			endDate:
				frequency === 'one_time'
					? null
					: endMonth.trim().length > 0
						? requireYearMonthInput(endMonth)
						: null,
			sourceAssetAccountId: sourceLink.id,
			destinationAssetAccountId: destinationLink.id,
			description
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, cashflows: nextBundle.cashflows };
	},

	createCashflow: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const type = String(formData.get('type') ?? '');
		const category = String(formData.get('category') ?? '');
		const frequency = String(formData.get('frequency') ?? '');
		const amount = Number(formData.get('amount'));
		const inflationAffected = formData.get('inflationAffected') === 'on';
		const startMonth = String(formData.get('startDate') ?? '');
		const endMonth = String(formData.get('endDate') ?? '');
		const description = String(formData.get('description') ?? '').trim();
		const assetAccountId = String(formData.get('assetAccountId') ?? '');

		if (
			!scenarioId ||
			!assetId ||
			(type !== 'income' && type !== 'expense') ||
			(category !== 'living_expenses' &&
				category !== 'employment_income' &&
				category !== 'misc_income' &&
				category !== 'asset_ownership' &&
				category !== 'rental_income') ||
			(frequency !== 'monthly' &&
				frequency !== 'quarterly' &&
				frequency !== 'annually' &&
				frequency !== 'one_time') ||
			!Number.isFinite(amount) ||
			!description ||
			!assetAccountId ||
			!isValidYearMonthInput(startMonth) ||
			(endMonth.trim().length > 0 && !isValidYearMonthInput(endMonth))
		) {
			return fail(400, { error: 'Invalid input.' });
		}

		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const { assetAccounts, assets, accounts } = projectionBundle;
		const asset = assets.find((item) => item.id === assetId);
		if (!asset) {
			return fail(404, { error: 'Asset not found.' });
		}
		const resolvedAssetAccountId = await resolveAssetAccountId(
			assetAccountId,
			assetId,
			asset.asset_type,
			scenarioId,
			assetAccounts,
			accounts
		);
		if (!resolvedAssetAccountId) {
			return fail(400, { error: 'Account selection is invalid.' });
		}
		const categoryError = validateCashflowCategory(asset.asset_type, type, category);
		if (categoryError) {
			return fail(400, { error: categoryError });
		}

		await createCashflow({
			scenarioId,
			type,
			frequency,
			category,
			amount,
			inflationAffected,
			startDate: requireYearMonthInput(startMonth),
			endDate: endMonth.trim().length > 0 ? requireYearMonthInput(endMonth) : null,
			sourceAssetAccountId: type === 'expense' ? resolvedAssetAccountId : null,
			destinationAssetAccountId: type === 'income' ? resolvedAssetAccountId : null,
			description,
			createdBy: userId
		});

		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, cashflows: nextBundle.cashflows };
	},

	deleteCashflow: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		if (!scenarioId || !cashflowId) {
			return fail(400, { error: 'Invalid input.' });
		}
		const deleted = await deleteCashflow(userId, scenarioId, cashflowId);
		if (!deleted) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, cashflows: nextBundle.cashflows };
	},

	updateCashflow: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		const type = String(formData.get('type') ?? '');
		const category = String(formData.get('category') ?? '');
		const frequency = String(formData.get('frequency') ?? '');
		const amount = Number(formData.get('amount'));
		const inflationAffected = formData.get('inflationAffected') === 'on';
		const startMonth = String(formData.get('startDate') ?? '');
		const endMonth = String(formData.get('endDate') ?? '');
		const description = String(formData.get('description') ?? '').trim();
		const assetAccountId = String(formData.get('assetAccountId') ?? '');

		if (
			!scenarioId ||
			!assetId ||
			!cashflowId ||
			(type !== 'income' && type !== 'expense') ||
			(category !== 'living_expenses' &&
				category !== 'employment_income' &&
				category !== 'misc_income' &&
				category !== 'asset_ownership' &&
				category !== 'rental_income') ||
			(frequency !== 'monthly' &&
				frequency !== 'quarterly' &&
				frequency !== 'annually' &&
				frequency !== 'one_time') ||
			!Number.isFinite(amount) ||
			!description ||
			!assetAccountId ||
			!isValidYearMonthInput(startMonth) ||
			(endMonth.trim().length > 0 && !isValidYearMonthInput(endMonth))
		) {
			return fail(400, { error: 'Invalid input.' });
		}

		const projectionBundle = await getProjectionBundleForUser(userId, scenarioId);
		if (!projectionBundle.scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const { assetAccounts, assets, accounts } = projectionBundle;
		const asset = assets.find((item) => item.id === assetId);
		if (!asset) {
			return fail(404, { error: 'Asset not found.' });
		}
		const resolvedAssetAccountId = await resolveAssetAccountId(
			assetAccountId,
			assetId,
			asset.asset_type,
			scenarioId,
			assetAccounts,
			accounts
		);
		if (!resolvedAssetAccountId) {
			return fail(400, { error: 'Account selection is invalid.' });
		}
		const categoryError = validateCashflowCategory(asset.asset_type, type, category);
		if (categoryError) {
			return fail(400, { error: categoryError });
		}

		const updated = await updateCashflow({
			userId,
			scenarioId,
			cashflowId,
			type,
			frequency,
			category,
			amount,
			inflationAffected,
			startDate: requireYearMonthInput(startMonth),
			endDate: endMonth.trim().length > 0 ? requireYearMonthInput(endMonth) : null,
			sourceAssetAccountId: type === 'expense' ? resolvedAssetAccountId : null,
			destinationAssetAccountId: type === 'income' ? resolvedAssetAccountId : null,
			description
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}

		const nextBundle = await getProjectionBundleForUser(userId, scenarioId);
		return { success: true, cashflows: nextBundle.cashflows };
	}
};

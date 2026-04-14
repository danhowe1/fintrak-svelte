import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	type AccountBalanceTarget,
	type AccountListItem,
	type AssetAccountLink,
	type AssetListItem,
	type AutoFundingRule,
	type AutoSweepRule,
	type CashflowSummary,
	getCashflowsForScenario,
	getAccountsForScenario,
	getAssetsForScenario,
	getAssetAccountsForScenario,
	createCashflow,
	deleteCashflow,
	updateCashflow,
	getScenarioForUserById,
	updateCashflowAmount,
	updateCashflowInflationAffected,
	updatePersonRetirementAge,
	updatePersonDetails,
	updatePropertyDetails,
	updateShareDetails,
	updateAccountInterestRate,
	updateAccountDetails,
	updateMortgageDetails,
	updateSuperannuationDetails,
	getOrCreateHeldInAssetAccount,
	deleteAssetForScenario,
	getAutoFundingRulesForScenario,
	createAutoFundingRule,
	deleteAutoFundingRule,
	getAccountBalanceTargetsForScenario,
	upsertAccountBalanceTarget,
	deleteAccountBalanceTarget,
	getAutoSweepRulesForScenario,
	createAutoSweepRule,
	deleteAutoSweepRule,
	reorderAutoFundingRules,
	reorderAutoSweepRules
} from '$lib/server/database';
import {
	parseProjectionRange,
	resolveDashboardScenario,
	syncCurrentScenarioCookie
} from '$lib/server/dashboard-context';
import type { ProjectionResult } from '$lib/server/projection';
import { parseYearMonthInput } from '$lib/yearMonth';

const CASH_ACCOUNT_SELECTION_PREFIX = 'account:';

const parseSelectedAccountId = (value: string) =>
	value.startsWith(CASH_ACCOUNT_SELECTION_PREFIX)
		? value.slice(CASH_ACCOUNT_SELECTION_PREFIX.length)
		: null;

const EMPTY_PROJECTION: ProjectionResult = {
	startDate: 0,
	endDate: 0,
	transactions: [],
	accounts: [],
	assets: [],
	liquidity: {
		series: [],
		points: []
	},
	planner: {
		stage: 'reserves_caps',
		status: 'on_track',
		headline: '',
		firstLiquidityDeficit: null,
		hasCapBreach: false,
		firstShortfall: null
	},
	events: []
};

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	const { scenario, scenarioId } = await resolveDashboardScenario(event);

	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	syncCurrentScenarioCookie(event, scenarioId ?? scenario.id);

	const projectionRangeParam = event.url.searchParams.get('projectionRange');
	const projectionRangeCookie = event.cookies.get('projectionRange');
	const projectionRange = parseProjectionRange(projectionRangeParam ?? projectionRangeCookie);

	if (projectionRangeParam && projectionRangeParam !== projectionRangeCookie) {
		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}

	if (!projectionRangeCookie && !projectionRangeParam) {
		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}
	return {
		scenario,
		cashflows: [] as CashflowSummary[],
		assets: [] as AssetListItem[],
		accounts: [] as AccountListItem[],
		assetAccounts: [] as AssetAccountLink[],
		autoFundingRules: [] as AutoFundingRule[],
		accountBalanceTargets: [] as AccountBalanceTarget[],
		autoSweepRules: [] as AutoSweepRule[],
		projection: EMPTY_PROJECTION,
		projectionRange,
		sessionRates: parentData.sessionRates
	};
};

export const actions: Actions = {
	updateInflationRate: async (event) => {
		const formData = await event.request.formData();
		const inflationRate = Number(formData.get('inflationRate'));
		const deltaInflation = Number(formData.get('deltaInflation') ?? 0);

		const nextInflation = Number.isFinite(inflationRate)
			? Math.round((inflationRate + deltaInflation) * 10) / 10
			: 2.0;

		event.cookies.set('inflationRate', nextInflation.toFixed(1), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});

		return { success: true };
	},
	updateRange: async (event) => {
		const formData = await event.request.formData();
		const nextRange = String(formData.get('projectionRange') ?? 'all');
		const projectionRange =
			nextRange === '1y' || nextRange === '5y' || nextRange === '10y' || nextRange === 'all'
				? nextRange
				: 'all';

		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});

		return { success: true };
	},
	upsertAutoFundingRule: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}

		const accounts = await getAccountsForScenario(scenarioId);
		const sourceAccount = accounts.find((account) => account.id === sourceAccountId);
		const targetAccount = accounts.find((account) => account.id === targetAccountId);
		const [assetAccounts, assets] = await Promise.all([
			getAssetAccountsForScenario(scenarioId),
			getAssetsForScenario(scenarioId)
		]);
		const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
		const shareAssetByAccountId = new Map<string, string>();
		for (const link of assetAccounts) {
			if (link.relationship_role !== 'held_in') continue;
			const linkedAsset = assetsById.get(link.asset_id);
			if (!linkedAsset || linkedAsset.asset_type !== 'shares') continue;
			if (!shareAssetByAccountId.has(link.account_id)) {
				shareAssetByAccountId.set(link.account_id, link.asset_id);
			}
		}
		const superAssetByAccountId = new Map<string, string>();
		for (const link of assetAccounts) {
			if (link.relationship_role !== 'held_in') continue;
			const linkedAsset = assetsById.get(link.asset_id);
			if (!linkedAsset || linkedAsset.asset_type !== 'superannuation') continue;
			if (!superAssetByAccountId.has(link.account_id)) {
				superAssetByAccountId.set(link.account_id, link.asset_id);
			}
		}
		const isAllowedAutoFundingSource = (accountId: string, accountType: string | undefined) =>
			accountType === 'cash_account' ||
			(accountType === 'brokerage' && shareAssetByAccountId.has(accountId)) ||
			(accountType === 'super_account' && superAssetByAccountId.has(accountId));
		if (
			!sourceAccount ||
			!targetAccount ||
			!isAllowedAutoFundingSource(sourceAccountId, sourceAccount.account_type) ||
			targetAccount.account_type !== 'cash_account'
		) {
			return fail(400, {
				error:
					'Auto-funding source must be a cash account, shares brokerage account, or eligible super account. Target must be a cash account.'
			});
		}

		await createAutoFundingRule({
			scenarioId,
			sourceAccountId,
			targetAccountId,
			enabled: true,
			minTargetBalance: 0
		});

		const autoFundingRules = await getAutoFundingRulesForScenario(scenarioId);
		return { success: true, autoFundingRules };
	},
	deleteAutoFundingRule: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const ruleId = String(formData.get('ruleId') ?? '');
		if (!scenarioId || !ruleId) {
			return fail(400, { error: 'Invalid auto-funding rule input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await deleteAutoFundingRule(scenarioId, ruleId);
		const autoFundingRules = await getAutoFundingRulesForScenario(scenarioId);
		return { success: true, autoFundingRules };
	},
	updateAccountBalanceTarget: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const accounts = await getAccountsForScenario(scenarioId);
		if (!accounts.some((account) => account.id === accountId)) {
			return fail(400, { error: 'Account not found in this scenario.' });
		}
		await upsertAccountBalanceTarget({
			scenarioId,
			accountId,
			minBalance: Math.round(minBalanceRaw * 100) / 100,
			maxBalance: maxBalance === null ? null : Math.round(maxBalance * 100) / 100,
			enabled: true
		});
		const accountBalanceTargets = await getAccountBalanceTargetsForScenario(scenarioId);
		return { success: true, accountBalanceTargets };
	},
	deleteAccountBalanceTarget: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const accountId = String(formData.get('accountId') ?? '');
		if (!scenarioId || !accountId) {
			return fail(400, { error: 'Invalid balance target input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await deleteAccountBalanceTarget(scenarioId, accountId);
		const accountBalanceTargets = await getAccountBalanceTargetsForScenario(scenarioId);
		return { success: true, accountBalanceTargets };
	},
	upsertAutoSweepRule: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const [accounts, assetAccounts, assets] = await Promise.all([
			getAccountsForScenario(scenarioId),
			getAssetAccountsForScenario(scenarioId),
			getAssetsForScenario(scenarioId)
		]);
		const accountsById = new Map(accounts.map((account) => [account.id, account]));
		const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
		const shareAssetByAccountId = new Map<string, string>();
		for (const link of assetAccounts) {
			if (link.relationship_role !== 'held_in') continue;
			const linkedAsset = assetsById.get(link.asset_id);
			if (!linkedAsset || linkedAsset.asset_type !== 'shares') continue;
			if (!shareAssetByAccountId.has(link.account_id)) {
				shareAssetByAccountId.set(link.account_id, link.asset_id);
			}
		}
		const superAssetByAccountId = new Map<string, string>();
		for (const link of assetAccounts) {
			if (link.relationship_role !== 'held_in') continue;
			const linkedAsset = assetsById.get(link.asset_id);
			if (!linkedAsset || linkedAsset.asset_type !== 'superannuation') continue;
			if (!superAssetByAccountId.has(link.account_id)) {
				superAssetByAccountId.set(link.account_id, link.asset_id);
			}
		}
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
			scenarioId,
			sourceAccountId,
			destinationAccountId,
			enabled: true
		});
		const autoSweepRules = await getAutoSweepRulesForScenario(scenarioId);
		return { success: true, autoSweepRules };
	},
	reorderAutoFundingRules: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
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
		const autoFundingRules = await getAutoFundingRulesForScenario(scenarioId);
		return { success: true, autoFundingRules };
	},
	reorderAutoSweepRules: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await reorderAutoSweepRules(scenarioId, sourceAccountId, ruleIds);
		const autoSweepRules = await getAutoSweepRulesForScenario(scenarioId);
		return { success: true, autoSweepRules };
	},
	deleteAutoSweepRule: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const ruleId = String(formData.get('ruleId') ?? '');
		if (!scenarioId || !ruleId) {
			return fail(400, { error: 'Invalid auto-sweep rule input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await deleteAutoSweepRule(scenarioId, ruleId);
		const autoSweepRules = await getAutoSweepRulesForScenario(scenarioId);
		return { success: true, autoSweepRules };
	},
	updateRetirementAge: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const retirementAge = Number(formData.get('retirementAge'));
		if (!scenarioId || !assetId || !Number.isFinite(retirementAge)) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updatePersonRetirementAge(scenarioId, assetId, retirementAge);
		return { success: true };
	},
	updatePersonDetails: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const name = String(formData.get('name') ?? '').trim();
		const startDateRaw = String(formData.get('startDate') ?? '').trim();
		const dobRaw = String(formData.get('dob') ?? '').trim();
		const startDate = parseYearMonthInput(startDateRaw);
		const dob = parseYearMonthInput(dobRaw);
		if (!scenarioId || !assetId || !name || startDate === null || dob === null) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updatePersonDetails(scenarioId, assetId, { name, startDate, dob });
		return { success: true };
	},
	updateCashflowAmount: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		const amount = Number(formData.get('amount'));
		if (!scenarioId || !cashflowId || !Number.isFinite(amount)) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updateCashflowAmount(scenarioId, cashflowId, amount);
		return { success: true };
	},
	updatePropertyDetails: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const name = String(formData.get('name') ?? '').trim();
		const startDate = String(formData.get('startDate') ?? '').trim();
		const propertyUseRaw = String(formData.get('propertyUse') ?? '').trim();
		const propertyUse =
			propertyUseRaw === 'primary_residence' ? 'primary_residence' : 'investment_property';
		const marketValueRaw = Number(formData.get('marketValue'));
		const marketGrowthRateRaw = Number(formData.get('marketGrowthRate'));
		const marketGrowthRate = Number.isFinite(marketGrowthRateRaw)
			? Math.round(marketGrowthRateRaw * 10) / 10
			: Number.NaN;
		const marketValue = Number.isFinite(marketValueRaw)
			? Math.round(marketValueRaw * 100) / 100
			: Number.NaN;
		const normalizedStartDate = parseYearMonthInput(startDate);
		const saleDateRaw = String(formData.get('saleDate') ?? '').trim();
		const saleDate = saleDateRaw.length > 0 ? saleDateRaw : null;
		const fixedSellingCostsRaw = Number(formData.get('fixedSellingCosts'));
		const variableSellingCostsRaw = Number(formData.get('variableSellingCosts'));
		const fixedSellingCosts = Number.isFinite(fixedSellingCostsRaw)
			? Math.round(fixedSellingCostsRaw * 100) / 100
			: Number.NaN;
		const variableSellingCosts = Number.isFinite(variableSellingCostsRaw)
			? Math.round(variableSellingCostsRaw * 100) / 100
			: Number.NaN;
		if (
			!scenarioId ||
			!assetId ||
			!name ||
			!startDate ||
			normalizedStartDate === null ||
			!Number.isFinite(marketValue) ||
			!Number.isFinite(marketGrowthRate) ||
			!Number.isFinite(fixedSellingCosts) ||
			!Number.isFinite(variableSellingCosts)
		) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updatePropertyDetails(scenarioId, assetId, {
			name,
			startDate,
			propertyUse,
			marketValue,
			marketGrowthRate,
			saleDate,
			fixedSellingCosts,
			variableSellingCosts
		});
		return { success: true };
	},
	updateShareDetails: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const name = String(formData.get('name') ?? '').trim();
		const startDate = String(formData.get('startDate') ?? '').trim();
		const capitalGrowthRateRaw = Number(formData.get('capitalGrowthRate'));
		const dividendYieldRaw = Number(formData.get('dividendYield'));
		const dividendsTakenAsIncomeDate = String(
			formData.get('dividendsTakenAsIncomeDate') ?? ''
		).trim();
		const capitalGrowthRate = Number.isFinite(capitalGrowthRateRaw)
			? Math.round(capitalGrowthRateRaw * 10) / 10
			: Number.NaN;
		const dividendYield = Number.isFinite(dividendYieldRaw)
			? Math.round(dividendYieldRaw * 10) / 10
			: Number.NaN;
		const normalizedStartDate = parseYearMonthInput(startDate);
		const normalizedDividendDate = parseYearMonthInput(dividendsTakenAsIncomeDate);
		if (
			!scenarioId ||
			!assetId ||
			!name ||
			!startDate ||
			normalizedStartDate === null ||
			!dividendsTakenAsIncomeDate ||
			normalizedDividendDate === null ||
			!Number.isFinite(capitalGrowthRate) ||
			!Number.isFinite(dividendYield)
		) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updateShareDetails(scenarioId, assetId, {
			name,
			startDate,
			capitalGrowthRate,
			dividendYield,
			dividendsTakenAsIncomeDate
		});
		return { success: true };
	},
	updateAccountInterestRate: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const accountId = String(formData.get('accountId') ?? '');
		const interestRateRaw = Number(formData.get('interestRate'));
		const interestRate = Number.isFinite(interestRateRaw)
			? Math.round(interestRateRaw * 100) / 100
			: Number.NaN;
		if (!scenarioId || !accountId || !Number.isFinite(interestRate)) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updateAccountInterestRate(scenarioId, accountId, interestRate);
		return { success: true };
	},
	updateAccountDetails: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const accountId = String(formData.get('accountId') ?? '');
		const name = String(formData.get('name') ?? '').trim();
		const startDateRaw = String(formData.get('startDate') ?? '').trim();
		const openingBalanceRaw = Number(formData.get('openingBalance'));
		const startDate = parseYearMonthInput(startDateRaw);
		const openingBalance = Number.isFinite(openingBalanceRaw)
			? Math.round(openingBalanceRaw * 100) / 100
			: Number.NaN;
		if (
			!scenarioId ||
			!accountId ||
			!name ||
			startDate === null ||
			!Number.isFinite(openingBalance)
		) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await updateAccountDetails(scenarioId, accountId, {
			name,
			startDate,
			openingBalance
		});
		return { success: true };
	},
	updateMortgageDetails: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const name = String(formData.get('name') ?? '').trim();
		const startDateRaw = String(formData.get('startDate') ?? '').trim();
		const termYearsRaw = Number(formData.get('termYears'));
		const termMonthsRaw = Number(formData.get('termMonths'));
		const mortgageAccountName = String(formData.get('mortgageAccountName') ?? '').trim();
		const openingBalanceRaw = Number(formData.get('openingBalance'));

		const startDate = parseYearMonthInput(startDateRaw);
		const termYears = Number.isFinite(termYearsRaw) ? Math.max(0, Math.round(termYearsRaw)) : NaN;
		const termMonths =
			Number.isFinite(termMonthsRaw) && termMonthsRaw >= 0 && termMonthsRaw <= 11
				? Math.round(termMonthsRaw)
				: NaN;
		const openingBalance = Number.isFinite(openingBalanceRaw)
			? Math.round(openingBalanceRaw * 100) / 100
			: NaN;

		if (
			!scenarioId ||
			!assetId ||
			!name ||
			!mortgageAccountName ||
			startDate === null ||
			!Number.isFinite(termYears) ||
			!Number.isFinite(termMonths) ||
			!Number.isFinite(openingBalance)
		) {
			return fail(400, { error: 'Invalid input.' });
		}

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}

		await updateMortgageDetails(scenarioId, assetId, {
			startDate,
			name,
			termYears,
			termMonths,
			mortgageAccountName,
			openingBalance
		});
		return { success: true };
	},
		updateSuperannuationDetails: async (event) => {
			const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const preservationAgeRaw = Number(formData.get('preservationAge'));
		const capitalGrowthRateRaw = Number(formData.get('capitalGrowthRate'));
		const managementFeeRateRaw = Number(formData.get('managementFeeRate'));
		const preservationAge = Number.isFinite(preservationAgeRaw)
			? Math.max(0, Math.round(preservationAgeRaw))
			: Number.NaN;
		const capitalGrowthRate = Number.isFinite(capitalGrowthRateRaw)
			? Math.round(capitalGrowthRateRaw * 100) / 100
			: Number.NaN;
		const managementFeeRate = Number.isFinite(managementFeeRateRaw)
			? Math.round(managementFeeRateRaw * 100) / 100
			: Number.NaN;
		if (
			!scenarioId ||
			!assetId ||
			!Number.isFinite(preservationAge) ||
			!Number.isFinite(capitalGrowthRate) ||
			!Number.isFinite(managementFeeRate)
		) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
			await updateSuperannuationDetails(scenarioId, assetId, {
				preservationAge,
				capitalGrowthRate,
				managementFeeRate
			});
			return { success: true };
		},
		deleteAsset: async (event) => {
			const userId = event.locals.appUserId;
			if (!userId) {
				throw redirect(303, '/login');
			}
			const formData = await event.request.formData();
			const scenarioId = String(formData.get('scenarioId') ?? '');
			const assetId = String(formData.get('assetId') ?? '');
			if (!scenarioId || !assetId) {
				return fail(400, { error: 'Invalid asset deletion input.' });
			}
			const scenario = await getScenarioForUserById(userId, scenarioId);
			if (!scenario) {
				return fail(404, { error: 'Scenario not found.' });
			}
			try {
				await deleteAssetForScenario(scenarioId, assetId);
			} catch (error) {
				return fail(400, {
					error:
						error instanceof Error
							? error.message
							: 'Unable to delete asset. Please try again.'
				});
			}
			return { success: true };
		},
		createTransferCashflow: async (event) => {
			const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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

		const isMonth = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());
		const normalizeMonth = (value: string) => {
			const parsedValue = parseYearMonthInput(value);
			if (parsedValue === null) {
				throw new Error('Invalid month format');
			}
			return parsedValue;
		};

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
			!isMonth(startMonth) ||
			(endMonth.trim().length > 0 && !isMonth(endMonth))
		) {
			return fail(400, { error: 'Invalid transfer input.' });
		}
		const transferFrequency = frequency as 'monthly' | 'quarterly' | 'annually' | 'one_time';

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}

		const [assetAccounts, accounts, assets] = await Promise.all([
			getAssetAccountsForScenario(scenarioId),
			getAccountsForScenario(scenarioId),
			getAssetsForScenario(scenarioId)
		]);
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
		const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
		const shareAssetByAccountId = new Map<string, string>();
		for (const link of assetAccounts) {
			if (link.relationship_role !== 'held_in') continue;
			const linkedAsset = assetsById.get(link.asset_id);
			if (!linkedAsset || linkedAsset.asset_type !== 'shares') continue;
			if (!shareAssetByAccountId.has(link.account_id)) {
				shareAssetByAccountId.set(link.account_id, link.asset_id);
			}
		}
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
		const destinationHasSharesAsset = shareAssetByAccountId.has(destinationAccountId);
		const sourceHasSharesAsset = shareAssetByAccountId.has(sourceAccountId);
		const cashflowCategory =
			sourceAccount?.account_type === 'cash_account' &&
			destinationAccount?.account_type === 'brokerage' &&
			destinationHasSharesAsset
				? 'shares_purchase'
				: sourceAccount?.account_type === 'brokerage' &&
					  destinationAccount?.account_type === 'cash_account' &&
					  sourceHasSharesAsset
					? 'shares_sale'
					: 'transfer';

		try {
			await createCashflow({
				scenarioId,
				type: 'transfer',
				frequency: transferFrequency,
				category: cashflowCategory,
				amount,
				inflationAffected,
				startDate: normalizeMonth(startMonth),
				endDate:
					transferFrequency === 'one_time'
						? null
						: endMonth.trim().length > 0
							? normalizeMonth(endMonth)
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

		const cashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows };
	},
	updateTransferInflationAffected: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		const inflationAffected = formData.get('inflationAffected') === 'on';
		if (!scenarioId || !cashflowId) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const cashflows = await getCashflowsForScenario(scenarioId);
		const cashflow = cashflows.find((item) => item.id === cashflowId);
		if (!cashflow || cashflow.cashflow_type !== 'transfer') {
			return fail(400, { error: 'Transfer not found.' });
		}
		await updateCashflowInflationAffected(scenarioId, cashflowId, inflationAffected);
		const nextCashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows: nextCashflows };
	},
	updateTransferCashflow: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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

		const isMonth = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());
		const normalizeMonth = (value: string) => {
			const parsedValue = parseYearMonthInput(value);
			if (parsedValue === null) {
				throw new Error('Invalid month format');
			}
			return parsedValue;
		};

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
			!isMonth(startMonth) ||
			(endMonth.trim().length > 0 && !isMonth(endMonth))
		) {
			return fail(400, { error: 'Invalid transfer input.' });
		}

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		const cashflows = await getCashflowsForScenario(scenarioId);
		const transfer = cashflows.find((item) => item.id === cashflowId);
		if (!transfer || transfer.cashflow_type !== 'transfer') {
			return fail(400, { error: 'Transfer not found.' });
		}
		const [assetAccounts, accounts, assets] = await Promise.all([
			getAssetAccountsForScenario(scenarioId),
			getAccountsForScenario(scenarioId),
			getAssetsForScenario(scenarioId)
		]);
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
		const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
		const shareAssetByAccountId = new Map<string, string>();
		for (const link of assetAccounts) {
			if (link.relationship_role !== 'held_in') continue;
			const linkedAsset = assetsById.get(link.asset_id);
			if (!linkedAsset || linkedAsset.asset_type !== 'shares') continue;
			if (!shareAssetByAccountId.has(link.account_id)) {
				shareAssetByAccountId.set(link.account_id, link.asset_id);
			}
		}
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
		const destinationHasSharesAsset = shareAssetByAccountId.has(destinationAccountId);
		const sourceHasSharesAsset = shareAssetByAccountId.has(sourceAccountId);
		const transferCategory =
			sourceAccount?.account_type === 'cash_account' &&
			destinationAccount?.account_type === 'brokerage' &&
			destinationHasSharesAsset
				? 'shares_purchase'
				: sourceAccount?.account_type === 'brokerage' &&
					  destinationAccount?.account_type === 'cash_account' &&
					  sourceHasSharesAsset
					? 'shares_sale'
					: 'transfer';

		await updateCashflow({
			scenarioId,
			cashflowId,
			type: 'transfer',
			frequency: frequency as 'monthly' | 'quarterly' | 'annually' | 'one_time',
			category: transferCategory,
			amount,
			inflationAffected: transfer.inflation_affected,
			startDate: normalizeMonth(startMonth),
			endDate:
				frequency === 'one_time'
					? null
					: endMonth.trim().length > 0
						? normalizeMonth(endMonth)
						: null,
			sourceAssetAccountId: sourceLink.id,
			destinationAssetAccountId: destinationLink.id,
			description
		});

		const nextCashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows: nextCashflows };
	},
	createCashflow: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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

		const isMonth = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());
		const normalizeMonth = (value: string) => {
			const parsedValue = parseYearMonthInput(value);
			if (parsedValue === null) {
				throw new Error('Invalid month format');
			}
			return parsedValue;
		};

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
			!isMonth(startMonth) ||
			(endMonth.trim().length > 0 && !isMonth(endMonth))
		) {
			return fail(400, { error: 'Invalid input.' });
		}

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}

		const [assetAccounts, assets] = await Promise.all([
			getAssetAccountsForScenario(scenarioId),
			getAssetsForScenario(scenarioId)
		]);
		const accounts = await getAccountsForScenario(scenarioId);
		const asset = assets.find((item) => item.id === assetId);
		if (!asset) {
			return fail(404, { error: 'Asset not found.' });
		}
		let resolvedAssetAccountId =
			assetAccounts.find(
				(link) =>
					link.id === assetAccountId &&
					link.asset_id === assetId &&
					link.relationship_role === 'held_in'
			)?.id ?? null;
		if (
			!resolvedAssetAccountId &&
			(asset.asset_type === 'person' || asset.asset_type === 'property')
		) {
			const selectedAccountId = parseSelectedAccountId(assetAccountId);
			const selectedAccount = selectedAccountId
				? accounts.find((account) => account.id === selectedAccountId)
				: null;
			if (selectedAccount?.account_type === 'cash_account') {
				resolvedAssetAccountId = await getOrCreateHeldInAssetAccount({
					scenarioId,
					assetId,
					accountId: selectedAccount.id
				});
			}
		}
		if (!resolvedAssetAccountId) {
			return fail(400, { error: 'Account selection is invalid.' });
		}
		if (asset.asset_type === 'person') {
			if (type === 'expense' && category !== 'living_expenses') {
				return fail(400, { error: 'Invalid category for person expense.' });
			}
			if (type === 'income' && category !== 'employment_income' && category !== 'misc_income') {
				return fail(400, { error: 'Invalid category for person income.' });
			}
		}
		if (asset.asset_type === 'property') {
			if (type === 'expense' && category !== 'asset_ownership') {
				return fail(400, { error: 'Invalid category for property expense.' });
			}
			if (type === 'income' && category !== 'rental_income') {
				return fail(400, { error: 'Invalid category for property income.' });
			}
		}

		await createCashflow({
			scenarioId,
			type,
			frequency,
			category,
			amount,
			inflationAffected,
			startDate: normalizeMonth(startMonth),
			endDate: endMonth.trim().length > 0 ? normalizeMonth(endMonth) : null,
			sourceAssetAccountId: type === 'expense' ? resolvedAssetAccountId : null,
			destinationAssetAccountId: type === 'income' ? resolvedAssetAccountId : null,
			description,
			createdBy: userId
		});

		const cashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows };
	},
	deleteCashflow: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const cashflowId = String(formData.get('cashflowId') ?? '');
		if (!scenarioId || !cashflowId) {
			return fail(400, { error: 'Invalid input.' });
		}
		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}
		await deleteCashflow(scenarioId, cashflowId);
		const cashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows };
	},
	updateCashflow: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			throw redirect(303, '/login');
		}
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

		const isMonth = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());
		const normalizeMonth = (value: string) => {
			const parsedValue = parseYearMonthInput(value);
			if (parsedValue === null) {
				throw new Error('Invalid month format');
			}
			return parsedValue;
		};

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
			!isMonth(startMonth) ||
			(endMonth.trim().length > 0 && !isMonth(endMonth))
		) {
			return fail(400, { error: 'Invalid input.' });
		}

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			return fail(404, { error: 'Scenario not found.' });
		}

		const [assetAccounts, assets] = await Promise.all([
			getAssetAccountsForScenario(scenarioId),
			getAssetsForScenario(scenarioId)
		]);
		const accounts = await getAccountsForScenario(scenarioId);
		const asset = assets.find((item) => item.id === assetId);
		if (!asset) {
			return fail(404, { error: 'Asset not found.' });
		}
		let resolvedAssetAccountId =
			assetAccounts.find(
				(link) =>
					link.id === assetAccountId &&
					link.asset_id === assetId &&
					link.relationship_role === 'held_in'
			)?.id ?? null;
		if (
			!resolvedAssetAccountId &&
			(asset.asset_type === 'person' || asset.asset_type === 'property')
		) {
			const selectedAccountId = parseSelectedAccountId(assetAccountId);
			const selectedAccount = selectedAccountId
				? accounts.find((account) => account.id === selectedAccountId)
				: null;
			if (selectedAccount?.account_type === 'cash_account') {
				resolvedAssetAccountId = await getOrCreateHeldInAssetAccount({
					scenarioId,
					assetId,
					accountId: selectedAccount.id
				});
			}
		}
		if (!resolvedAssetAccountId) {
			return fail(400, { error: 'Account selection is invalid.' });
		}
		if (asset.asset_type === 'person') {
			if (type === 'expense' && category !== 'living_expenses') {
				return fail(400, { error: 'Invalid category for person expense.' });
			}
			if (type === 'income' && category !== 'employment_income' && category !== 'misc_income') {
				return fail(400, { error: 'Invalid category for person income.' });
			}
		}
		if (asset.asset_type === 'property') {
			if (type === 'expense' && category !== 'asset_ownership') {
				return fail(400, { error: 'Invalid category for property expense.' });
			}
			if (type === 'income' && category !== 'rental_income') {
				return fail(400, { error: 'Invalid category for property income.' });
			}
		}

		await updateCashflow({
			scenarioId,
			cashflowId,
			type,
			frequency,
			category,
			amount,
			inflationAffected,
			startDate: normalizeMonth(startMonth),
			endDate: endMonth.trim().length > 0 ? normalizeMonth(endMonth) : null,
			sourceAssetAccountId: type === 'expense' ? resolvedAssetAccountId : null,
			destinationAssetAccountId: type === 'income' ? resolvedAssetAccountId : null,
			description
		});

		const cashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows };
	}
};

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getCashflowsForScenario,
	getAccountsForScenario,
	getAssetsForScenario,
	getAssetAccountsForScenario,
	createCashflow,
	deleteCashflow,
	updateCashflow,
	getScenarioForUserById,
	getSingleScenarioForUser,
	updateCashflowAmount,
	updateCashflowInflationAffected,
	updatePersonRetirementAge,
	updatePersonDetails,
	updatePropertyDetails,
	updateShareDetails,
	updateAccountInterestRate,
	updateAccountDetails,
	updateMortgageDetails
} from '$lib/server/database';
import { buildProjection } from '$lib/server/projection';
import { parseYearMonthInput } from '$lib/yearMonth';

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const scenario = scenarioId
		? await getScenarioForUserById(userId, scenarioId)
		: await getSingleScenarioForUser(userId);

	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	const currentScenarioId = event.cookies.get('currentScenarioId');
	const scenarioToStore = scenarioId ?? scenario.id;

	if (scenarioToStore && scenarioToStore !== currentScenarioId) {
		event.cookies.set('currentScenarioId', scenarioToStore, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}

	const cashflows = await getCashflowsForScenario(scenario.id);
	const [accounts, assets, assetAccounts] = await Promise.all([
		getAccountsForScenario(scenario.id),
		getAssetsForScenario(scenario.id),
		getAssetAccountsForScenario(scenario.id)
	]);

	const projectionRangeParam = event.url.searchParams.get('projectionRange');
	const projectionRangeCookie = event.cookies.get('projectionRange');
	const projectionRangeRaw = projectionRangeParam ?? projectionRangeCookie ?? 'all';
	const projectionRange =
		projectionRangeRaw === '1y' ||
		projectionRangeRaw === '5y' ||
		projectionRangeRaw === '10y' ||
		projectionRangeRaw === 'all'
			? projectionRangeRaw
			: 'all';

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
	const projectionMonths =
		projectionRange === '1y'
			? 12
			: projectionRange === '5y'
				? 60
				: projectionRange === '10y'
					? 120
					: null;

	const projection = buildProjection({
		inflationRate: parentData.sessionRates.inflationRate,
		projectionRange,
		maxMonths: projectionMonths,
		cashflows,
		accounts,
		assets,
		assetAccounts
	});

	return {
		scenario,
		cashflows,
		assets,
		accounts,
		assetAccounts,
		projection,
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
		const dividendsTakenAsIncomeDate = String(formData.get('dividendsTakenAsIncomeDate') ?? '').trim();
		const capitalGrowthRate = Number.isFinite(capitalGrowthRateRaw)
			? Math.round(capitalGrowthRateRaw * 100) / 100
			: Number.NaN;
		const dividendYield = Number.isFinite(dividendYieldRaw)
			? Math.round(dividendYieldRaw * 100) / 100
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
				(link) =>
					link.account_id === sourceAccountId && link.relationship_role === 'held_in'
			) ?? assetAccounts.find((link) => link.account_id === sourceAccountId);
		const destinationLink =
			assetAccounts.find(
				(link) =>
					link.account_id === destinationAccountId && link.relationship_role === 'held_in'
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
		if (!transfer.source_asset_account_id || !transfer.destination_asset_account_id) {
			return fail(400, { error: 'Transfer account links are missing.' });
		}

		await updateCashflow({
			scenarioId,
			cashflowId,
			type: 'transfer',
			frequency: frequency as 'monthly' | 'quarterly' | 'annually' | 'one_time',
			category: transfer.category,
			amount,
			inflationAffected: transfer.inflation_affected,
			startDate: normalizeMonth(startMonth),
			endDate:
				frequency === 'one_time'
					? null
					: endMonth.trim().length > 0
						? normalizeMonth(endMonth)
						: null,
			sourceAssetAccountId: transfer.source_asset_account_id,
			destinationAssetAccountId: transfer.destination_asset_account_id,
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
		const assetAccount = assetAccounts.find(
			(link) => link.id === assetAccountId && link.asset_id === assetId
		);
		if (!assetAccount) {
			return fail(400, { error: 'Account selection is invalid.' });
		}
		const asset = assets.find((item) => item.id === assetId);
		if (!asset) {
			return fail(404, { error: 'Asset not found.' });
		}
		if (asset.asset_type === 'person') {
			if (type === 'expense' && category !== 'living_expenses') {
				return fail(400, { error: 'Invalid category for person expense.' });
			}
			if (
				type === 'income' &&
				category !== 'employment_income'
			) {
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
			sourceAssetAccountId: type === 'expense' ? assetAccountId : null,
			destinationAssetAccountId: type === 'income' ? assetAccountId : null,
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
		const assetAccount = assetAccounts.find(
			(link) => link.id === assetAccountId && link.asset_id === assetId
		);
		if (!assetAccount) {
			return fail(400, { error: 'Account selection is invalid.' });
		}
		const asset = assets.find((item) => item.id === assetId);
		if (!asset) {
			return fail(404, { error: 'Asset not found.' });
		}
		if (asset.asset_type === 'person') {
			if (type === 'expense' && category !== 'living_expenses') {
				return fail(400, { error: 'Invalid category for person expense.' });
			}
			if (
				type === 'income' &&
				category !== 'employment_income'
			) {
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
			sourceAssetAccountId: type === 'expense' ? assetAccountId : null,
			destinationAssetAccountId: type === 'income' ? assetAccountId : null,
			description
		});

		const cashflows = await getCashflowsForScenario(scenarioId);
		return { success: true, cashflows };
	}
};

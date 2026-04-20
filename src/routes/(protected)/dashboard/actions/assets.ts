import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	updatePersonRetirementAge,
	updatePersonDetails,
	updatePropertyDetails,
	updateShareDetails,
	updateMortgageDetails,
	updateSuperannuationDetails,
	deleteAssetForScenario
} from '$lib/server/database';
import { parseYearMonthInput } from '$lib/yearMonth';

export const assetActions = {
	updateRetirementAge: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		const retirementAge = Number(formData.get('retirementAge'));
		if (!scenarioId || !assetId || !Number.isFinite(retirementAge)) {
			return fail(400, { error: 'Invalid input.' });
		}
		const updated = await updatePersonRetirementAge(userId, scenarioId, assetId, retirementAge);
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	updatePersonDetails: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		const updated = await updatePersonDetails(userId, scenarioId, assetId, { name, startDate, dob });
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	updatePropertyDetails: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		const updated = await updatePropertyDetails(userId, scenarioId, assetId, {
			name,
			startDate,
			propertyUse,
			marketValue,
			marketGrowthRate,
			saleDate,
			fixedSellingCosts,
			variableSellingCosts
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	updateShareDetails: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		const updated = await updateShareDetails(userId, scenarioId, assetId, {
			name,
			startDate,
			capitalGrowthRate,
			dividendYield,
			dividendsTakenAsIncomeDate
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	updateMortgageDetails: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		const updated = await updateMortgageDetails(userId, scenarioId, assetId, {
			startDate,
			name,
			termYears,
			termMonths,
			mortgageAccountName,
			openingBalance
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	updateSuperannuationDetails: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		const updated = await updateSuperannuationDetails(userId, scenarioId, assetId, {
			preservationAge,
			capitalGrowthRate,
			managementFeeRate
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	deleteAsset: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
		const formData = await event.request.formData();
		const scenarioId = String(formData.get('scenarioId') ?? '');
		const assetId = String(formData.get('assetId') ?? '');
		if (!scenarioId || !assetId) {
			return fail(400, { error: 'Invalid asset deletion input.' });
		}
		try {
			const deleted = await deleteAssetForScenario(userId, scenarioId, assetId);
			if (!deleted) {
				return fail(404, { error: 'Scenario not found.' });
			}
		} catch (error) {
			return fail(400, {
				error:
					error instanceof Error ? error.message : 'Unable to delete asset. Please try again.'
			});
		}
		return { success: true };
	}
};

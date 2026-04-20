import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { updateAccountInterestRate, updateAccountDetails } from '$lib/server/database';
import { parseYearMonthInput } from '$lib/yearMonth';

export const accountActions = {
	updateAccountInterestRate: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		const updated = await updateAccountInterestRate(userId, scenarioId, accountId, interestRate);
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	},

	updateAccountDetails: async (event: RequestEvent) => {
		const userId = event.locals.appUserId;
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
		if (!scenarioId || !accountId || !name || startDate === null || !Number.isFinite(openingBalance)) {
			return fail(400, { error: 'Invalid input.' });
		}
		const updated = await updateAccountDetails(userId, scenarioId, accountId, {
			name,
			startDate,
			openingBalance
		});
		if (!updated) {
			return fail(404, { error: 'Scenario not found.' });
		}
		return { success: true };
	}
};

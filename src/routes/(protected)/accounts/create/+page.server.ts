import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import {
	createAccountWithHolders,
	getAssetsForScenario,
	getScenarioForUserById
} from '$lib/server/database';
import { parseYearMonthInput } from '$lib/yearMonth';

const decimalUpToTwoPlacesSchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a number with up to 2 decimal places' })
	.transform((value) => Number(value));

const currencySchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a valid amount' })
	.transform((value) => Number(value));

const createAccountSchema = z.object({
	accountType: z.enum(['cash_account', 'credit_card']),
	name: z.string().trim().min(1, 'Account name is required'),
	startDate: z
		.string()
		.trim()
		.regex(/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/, { message: 'Start month is required' }),
	interestRate: decimalUpToTwoPlacesSchema,
	openingBalance: currencySchema,
	personIds: z.array(z.string()).min(1, 'Select at least one account holder')
});

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarioId = event.cookies.get('currentScenarioId');
	if (!scenarioId) {
		throw redirect(303, '/scenarios');
	}

	const scenario = await getScenarioForUserById(userId, scenarioId);
	if (!scenario) {
		throw redirect(303, '/scenarios');
	}

	const assets = await getAssetsForScenario(scenario.id);
	const people = assets.filter((asset) => asset.asset_type === 'person');

	return { scenario, people };
};

export const actions: Actions = {
	default: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}
		const scenarioId = event.cookies.get('currentScenarioId');
		if (!scenarioId) {
			throw redirect(303, '/scenarios');
		}

		const scenario = await getScenarioForUserById(userId, scenarioId);
		if (!scenario) {
			throw redirect(303, '/scenarios');
		}

		const formData = await event.request.formData();
		const payload = {
			accountType: formData.get('accountType'),
			name: formData.get('name'),
			startDate: formData.get('startDate'),
			interestRate: formData.get('interestRate'),
			openingBalance: formData.get('openingBalance'),
			personIds: formData.getAll('personIds')
		};

		const parsed = createAccountSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const { accountType, name, startDate, interestRate, openingBalance, personIds } = parsed.data;
		const normalizedStartDate = parseYearMonthInput(startDate);
		if (normalizedStartDate === null) {
			return fail(400, {
				errors: { startDate: ['Start month is required'] },
				values: payload
			});
		}

		const assets = await getAssetsForScenario(scenario.id);
		const validPeople = new Set(
			assets.filter((asset) => asset.asset_type === 'person').map((asset) => asset.id)
		);
		const holderAssetIds = personIds.filter((id) => validPeople.has(id));

		if (holderAssetIds.length === 0) {
			return fail(400, {
				errors: { personIds: ['Select at least one account holder'] },
				values: payload
			});
		}

		await createAccountWithHolders({
			scenarioId: scenario.id,
			accountType,
			name,
			details: {
				interestRate,
				openingBalance,
				startDate: normalizedStartDate
			},
			holderAssetIds
		});

		throw redirect(303, '/accounts');
	}
};

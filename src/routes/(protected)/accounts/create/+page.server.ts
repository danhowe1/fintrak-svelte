import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import {
	createAccount,
	getScenarioForUserById
} from '$lib/server/database';

const decimalOnePlaceSchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d)?$/, { message: 'Must be a number with 1 decimal place' })
	.transform((value) => Number(value));

const currencySchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a valid amount' })
	.transform((value) => Number(value));

const createAccountSchema = z.object({
	accountType: z.enum([
		'current_account',
		'mortgage_account',
		'savings_account',
		'credit_card',
		'brokerage',
		'super_account'
	]),
	name: z.string().trim().min(1, 'Account name is required'),
	interestRate: decimalOnePlaceSchema,
	openingBalance: currencySchema
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

	return { scenario };
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
			interestRate: formData.get('interestRate'),
			openingBalance: formData.get('openingBalance')
		};

		const parsed = createAccountSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const { accountType, name, interestRate, openingBalance } = parsed.data;

		await createAccount({
			scenarioId: scenario.id,
			accountType,
			name,
			details: {
				interestRate,
				openingBalance
			}
		});

		throw redirect(303, '/accounts');
	}
};


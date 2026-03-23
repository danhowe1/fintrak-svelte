import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { z } from 'zod';
import { createScenarioWithPerson } from '$lib/server/database';

const decimalOnePlaceSchema = z
	.string()
	.trim()
	.regex(/^-?\d+\.\d$/, { message: 'Must be a number with 1 decimal place' })
	.transform((value) => Number(value));

const currencySchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a valid amount' })
	.transform((value) => Number(value));

const positiveCurrencySchema = currencySchema.refine((value) => value > 0, {
	message: 'Must be greater than 0'
});

const createScenarioSchema = z.object({
	scenarioName: z.string().trim().min(1, 'Scenario name is required'),
	startDate: z
		.string()
		.trim()
		.regex(/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/, { message: 'Start month is required' }),
	personName: z.string().trim().min(1, 'Person name is required'),
	personDob: z
		.string()
		.trim()
		.regex(/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/, { message: 'Date of birth month is required' }),
	retirementAge: z
		.string()
		.trim()
		.regex(/^\d+$/, { message: 'Retirement age must be a whole number' })
		.transform((value) => Number(value)),
	monthlyNetIncome: positiveCurrencySchema,
	monthlyEssentialExpenses: positiveCurrencySchema,
	accountName: z.string().trim().min(1, 'Account name is required'),
	accountInterestRate: decimalOnePlaceSchema,
	openingBalance: currencySchema
});

export const actions: Actions = {
	default: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}

		const formData = await event.request.formData();
		const payload = {
			scenarioName: formData.get('scenarioName'),
			startDate: formData.get('startDate'),
			personName: formData.get('personName'),
			personDob: formData.get('personDob'),
			retirementAge: formData.get('retirementAge'),
			monthlyNetIncome: formData.get('monthlyNetIncome'),
			monthlyEssentialExpenses: formData.get('monthlyEssentialExpenses'),
			accountName: formData.get('accountName'),
			accountInterestRate: formData.get('accountInterestRate'),
			openingBalance: formData.get('openingBalance')
		};

		const parsed = createScenarioSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const {
			scenarioName,
			startDate,
			personName,
			personDob,
			retirementAge,
			monthlyNetIncome,
			monthlyEssentialExpenses,
			accountName,
			accountInterestRate,
			openingBalance
		} = parsed.data;

		const normalizeMonth = (value: string) => {
			const cleaned = value.replace(/\D/g, '');
			const month = cleaned.slice(0, 2);
			const year = cleaned.slice(2, 6);
			return `${year}-${month}-01`;
		};

		const scenarioId = await createScenarioWithPerson({
			userId,
			scenarioName,
			startDate: normalizeMonth(startDate),
			personName,
			personDob: normalizeMonth(personDob),
			retirementAge,
			monthlyNetIncome,
			monthlyEssentialExpenses,
			accountName,
			accountInterestRate,
			openingBalance
		});

		event.cookies.set('currentScenarioId', scenarioId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});

		throw redirect(303, '/dashboard');
	}
};

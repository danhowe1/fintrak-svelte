import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { z } from 'zod';
import { createScenarioWithPerson, getAuthenticatedUserId } from '$lib/server/database';

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

const createScenarioSchema = z.object({
	scenarioName: z.string().trim().min(1, 'Scenario name is required'),
	startDate: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), {
		message: 'Start date is required'
	}),
	inflationRate: decimalOnePlaceSchema,
	interestRateRise: decimalOnePlaceSchema,
	personName: z.string().trim().min(1, 'Person name is required'),
	personDob: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), {
		message: 'Date of birth is required'
	}),
	retirementAge: z
		.string()
		.trim()
		.regex(/^\d+$/, { message: 'Retirement age must be a whole number' })
		.transform((value) => Number(value)),
	accountName: z.string().trim().min(1, 'Account name is required'),
	accountInterestRate: decimalOnePlaceSchema,
	openingBalance: currencySchema
});

export const actions: Actions = {
	default: async (event) => {
		const session = await event.locals.auth();
		if (!session) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}

		const formData = await event.request.formData();
		const payload = {
			scenarioName: formData.get('scenarioName'),
			startDate: formData.get('startDate'),
			inflationRate: formData.get('inflationRate'),
			interestRateRise: formData.get('interestRateRise'),
			personName: formData.get('personName'),
			personDob: formData.get('personDob'),
			retirementAge: formData.get('retirementAge'),
			accountName: formData.get('accountName'),
			accountInterestRate: formData.get('accountInterestRate'),
			openingBalance: formData.get('openingBalance')
		};

		const parsed = createScenarioSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const userId = getAuthenticatedUserId(session);
		const {
			scenarioName,
			startDate,
			inflationRate,
			interestRateRise,
			personName,
			personDob,
			retirementAge,
			accountName,
			accountInterestRate,
			openingBalance
		} = parsed.data;

		await createScenarioWithPerson({
			userId,
			scenarioName,
			startDate,
			inflationRate,
			interestRateRise,
			personName,
			personDob,
			retirementAge,
			accountName,
			accountInterestRate,
			openingBalance
		});

		throw redirect(303, '/app');
	}
};

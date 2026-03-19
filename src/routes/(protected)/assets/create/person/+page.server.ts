import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import {
	createPersonAssetWithCashflows,
	getAccountsForScenario,
	getScenarioForUserById
} from '$lib/server/database';

const monthSchema = z
	.string()
	.trim()
	.regex(/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/, { message: 'Month is required' });

const currencySchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a valid amount' })
	.transform((value) => Number(value));

const decimalOnePlaceSchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d)?$/, { message: 'Must be a number with 1 decimal place' })
	.transform((value) => Number(value));

const uuidSchema = z.string().uuid();

const createPersonSchema = z
	.object({
		name: z.string().trim().min(1, 'Person name is required'),
		startMonth: monthSchema,
		personDob: monthSchema,
		retirementAge: z
			.string()
			.trim()
			.regex(/^\d+$/, { message: 'Retirement age must be a whole number' }),
		employmentIncome: currencySchema,
		essentialExpenses: currencySchema,
		incomeAccountChoice: z.string().trim().min(1, 'Select an income account option'),
		expenseAccountChoice: z.string().trim().optional(),
		useSameAccount: z.string().trim().optional(),
		incomeAccountName: z.string().trim().optional(),
		incomeAccountInterestRate: z.string().trim().optional(),
		incomeAccountOpeningBalance: z.string().trim().optional(),
		expenseAccountName: z.string().trim().optional(),
		expenseAccountInterestRate: z.string().trim().optional(),
		expenseAccountOpeningBalance: z.string().trim().optional()
	})
	.superRefine((data, ctx) => {
		if (data.incomeAccountChoice === 'new') {
			if (!data.incomeAccountName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Income account name is required',
					path: ['incomeAccountName']
				});
			}
			if (!data.incomeAccountInterestRate || !/^-?\d+(\.\d)?$/.test(data.incomeAccountInterestRate)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Income account interest rate is required',
					path: ['incomeAccountInterestRate']
				});
			}
			if (
				!data.incomeAccountOpeningBalance ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.incomeAccountOpeningBalance)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Income account opening balance is required',
					path: ['incomeAccountOpeningBalance']
				});
			}
		} else {
			const parsed = uuidSchema.safeParse(data.incomeAccountChoice);
			if (!parsed.success) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Income account selection is invalid',
					path: ['incomeAccountChoice']
				});
			}
		}

		const useSame = data.useSameAccount === 'on';
		if (!useSame) {
			if (!data.expenseAccountChoice) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select an expenses account option',
					path: ['expenseAccountChoice']
				});
			} else if (data.expenseAccountChoice === 'new') {
				if (!data.expenseAccountName) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Expense account name is required',
						path: ['expenseAccountName']
					});
				}
				if (
					!data.expenseAccountInterestRate ||
					!/^-?\d+(\.\d)?$/.test(data.expenseAccountInterestRate)
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Expense account interest rate is required',
						path: ['expenseAccountInterestRate']
					});
				}
				if (
					!data.expenseAccountOpeningBalance ||
					!/^-?\d+(\.\d{1,2})?$/.test(data.expenseAccountOpeningBalance)
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Expense account opening balance is required',
						path: ['expenseAccountOpeningBalance']
					});
				}
			} else {
				const parsed = uuidSchema.safeParse(data.expenseAccountChoice);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Expense account selection is invalid',
						path: ['expenseAccountChoice']
					});
				}
			}
		}
	});

const normalizeMonth = (value: string) => {
	const cleaned = value.replace(/\D/g, '');
	const month = cleaned.slice(0, 2);
	const year = cleaned.slice(2, 6);
	return `${year}-${month}-01`;
};

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

	const accounts = await getAccountsForScenario(scenario.id);

	return { scenario, accounts };
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
			name: formData.get('name'),
			startMonth: formData.get('startMonth'),
			personDob: formData.get('personDob'),
			retirementAge: formData.get('retirementAge'),
			employmentIncome: formData.get('employmentIncome'),
			essentialExpenses: formData.get('essentialExpenses'),
			incomeAccountChoice: formData.get('incomeAccountChoice'),
			expenseAccountChoice: formData.get('expenseAccountChoice'),
			useSameAccount: formData.get('useSameAccount'),
			incomeAccountName: formData.get('incomeAccountName'),
			incomeAccountInterestRate: formData.get('incomeAccountInterestRate'),
			incomeAccountOpeningBalance: formData.get('incomeAccountOpeningBalance'),
			expenseAccountName: formData.get('expenseAccountName'),
			expenseAccountInterestRate: formData.get('expenseAccountInterestRate'),
			expenseAccountOpeningBalance: formData.get('expenseAccountOpeningBalance')
		};

		const parsed = createPersonSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const {
			name,
			startMonth,
			personDob,
			retirementAge,
			employmentIncome,
			essentialExpenses,
			incomeAccountChoice,
			expenseAccountChoice,
			useSameAccount,
			incomeAccountName,
			incomeAccountInterestRate,
			incomeAccountOpeningBalance,
			expenseAccountName,
			expenseAccountInterestRate,
			expenseAccountOpeningBalance
		} = parsed.data;

		await createPersonAssetWithCashflows({
			scenarioId: scenario.id,
			userId,
			name,
			dob: normalizeMonth(personDob),
			retirementAge: Number(retirementAge),
			startDate: normalizeMonth(startMonth),
			employmentIncome,
			essentialExpenses,
			incomeAccount:
				incomeAccountChoice === 'new'
					? {
							type: 'new',
							name: incomeAccountName ?? 'Income account',
							interestRate: decimalOnePlaceSchema.parse(incomeAccountInterestRate ?? '0'),
							openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
						}
					: { type: 'existing', accountId: incomeAccountChoice },
			expenseAccount:
				useSameAccount === 'on'
					? incomeAccountChoice === 'new'
						? {
								type: 'new',
								name: incomeAccountName ?? 'Income account',
								interestRate: decimalOnePlaceSchema.parse(incomeAccountInterestRate ?? '0'),
								openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
							}
						: { type: 'existing', accountId: incomeAccountChoice }
					: expenseAccountChoice === 'new'
						? {
								type: 'new',
								name: expenseAccountName ?? 'Expense account',
								interestRate: decimalOnePlaceSchema.parse(expenseAccountInterestRate ?? '0'),
								openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
							}
						: { type: 'existing', accountId: expenseAccountChoice ?? '' }
		});

		throw redirect(303, '/assets');
	}
};


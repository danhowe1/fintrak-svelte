import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import {
	createAsset,
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

const createAssetSchema = z
	.object({
		assetType: z.enum(['person', 'property', 'mortgage', 'superannuation']),
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		personDob: z.string().trim().optional(),
		retirementAge: z.string().trim().optional(),
		propertyMarketValue: z.string().trim().optional(),
		employmentIncome: z.string().trim().optional(),
		essentialExpenses: z.string().trim().optional(),
		incomeAccountChoice: z.string().trim().optional(),
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
		if (data.assetType === 'person') {
			const useSame = data.useSameAccount === 'on';
			if (!data.personDob || !/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(data.personDob)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Date of birth month is required',
					path: ['personDob']
				});
			}
			if (!data.retirementAge || !/^\d+$/.test(data.retirementAge)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Retirement age must be a whole number',
					path: ['retirementAge']
				});
			}

			if (!data.employmentIncome || !/^-?\d+(\.\d{1,2})?$/.test(data.employmentIncome)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Employment income is required',
					path: ['employmentIncome']
				});
			}

			if (!data.essentialExpenses || !/^-?\d+(\.\d{1,2})?$/.test(data.essentialExpenses)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Essential living expenses are required',
					path: ['essentialExpenses']
				});
			}

			if (!data.incomeAccountChoice) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select an income account option',
					path: ['incomeAccountChoice']
				});
			}

			if (!useSame && !data.expenseAccountChoice) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select an expenses account option',
					path: ['expenseAccountChoice']
				});
			}

			if (data.incomeAccountChoice === 'new') {
				if (!data.incomeAccountName) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Income account name is required',
						path: ['incomeAccountName']
					});
				}
				if (
					!data.incomeAccountInterestRate ||
					!/^-?\d+(\.\d)?$/.test(data.incomeAccountInterestRate)
				) {
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
			} else if (data.incomeAccountChoice && data.incomeAccountChoice !== 'new') {
				const parsed = uuidSchema.safeParse(data.incomeAccountChoice);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Income account selection is invalid',
						path: ['incomeAccountChoice']
					});
				}
			}

			if (!useSame && data.expenseAccountChoice === 'new') {
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
			} else if (!useSame && data.expenseAccountChoice && data.expenseAccountChoice !== 'new') {
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

		if (data.assetType === 'property') {
			if (!data.propertyMarketValue || !/^-?\d+(\.\d{1,2})?$/.test(data.propertyMarketValue)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Market value is required',
					path: ['propertyMarketValue']
				});
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

	const requestedType = event.url.searchParams.get('type');
	if (!requestedType || requestedType === 'person') {
		throw redirect(303, '/assets/create/person');
	}

	const accounts = await getAccountsForScenario(scenario.id);

	const assetType =
		requestedType && ['person', 'property', 'mortgage', 'superannuation'].includes(requestedType)
			? requestedType
			: 'person';

	return { scenario, assetType, accounts };
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
			assetType: formData.get('assetType'),
			name: formData.get('name'),
			startMonth: formData.get('startMonth'),
			personDob: formData.get('personDob'),
			retirementAge: formData.get('retirementAge'),
			propertyMarketValue: formData.get('propertyMarketValue'),
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

		const parsed = createAssetSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const {
			assetType,
			name,
			startMonth,
			personDob,
			retirementAge,
			propertyMarketValue,
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

		const requestedType = event.url.searchParams.get('type');
		if (requestedType && requestedType !== assetType) {
			return fail(400, {
				errors: { assetType: ['Asset type does not match the selected create flow.'] },
				values: payload
			});
		}

		const details: Record<string, unknown> = {
			startDate: normalizeMonth(startMonth)
		};

		if (assetType === 'property') {
			details.marketValue = currencySchema.parse(propertyMarketValue ?? '');
		}

		try {
			if (assetType === 'person') {
				await createPersonAssetWithCashflows({
					scenarioId: scenario.id,
					userId,
					name,
					dob: normalizeMonth(personDob ?? ''),
					retirementAge: Number(retirementAge),
					startDate: details.startDate as string,
					employmentIncome: currencySchema.parse(employmentIncome ?? ''),
					essentialExpenses: currencySchema.parse(essentialExpenses ?? ''),
					incomeAccount:
						incomeAccountChoice === 'new'
							? {
									type: 'new',
									name: incomeAccountName ?? 'Income account',
									interestRate: decimalOnePlaceSchema.parse(
										incomeAccountInterestRate ?? '0'
									),
									openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
								}
							: { type: 'existing', accountId: incomeAccountChoice ?? '' },
					expenseAccount:
						useSameAccount === 'on'
							? incomeAccountChoice === 'new'
								? {
										type: 'new',
										name: incomeAccountName ?? 'Income account',
										interestRate: decimalOnePlaceSchema.parse(
											incomeAccountInterestRate ?? '0'
										),
										openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
									}
								: { type: 'existing', accountId: incomeAccountChoice ?? '' }
							: expenseAccountChoice === 'new'
								? {
										type: 'new',
										name: expenseAccountName ?? 'Expense account',
										interestRate: decimalOnePlaceSchema.parse(
											expenseAccountInterestRate ?? '0'
										),
										openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
									}
								: { type: 'existing', accountId: expenseAccountChoice ?? '' }
				});
			} else {
				await createAsset({
					scenarioId: scenario.id,
					assetType,
					name,
					details
				});
			}
		} catch (error) {
			return fail(500, {
				formError: 'Unable to create asset. Please check the inputs and try again.',
				values: payload
			});
		}

		throw redirect(303, '/assets');
	}
};


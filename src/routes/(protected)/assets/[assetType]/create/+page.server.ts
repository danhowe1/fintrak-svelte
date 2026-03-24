import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import {
	createAsset,
	createPersonAssetWithCashflows,
	createPropertyAssetWithExpense,
	createMortgageAssetWithAccounts,
	getAccountsForScenario,
	getAssetsForScenario,
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
const assetTypeSchema = z.enum(['person', 'property', 'mortgage', 'superannuation']);

const createAssetSchema = z
	.object({
		assetType: assetTypeSchema,
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		personDob: z.string().trim().optional(),
		retirementAge: z.string().trim().optional(),
		propertyMarketValue: z.string().trim().optional(),
		propertySaleDate: z.string().trim().optional(),
		propertyOwnershipExpense: z.string().trim().optional(),
		mortgagePropertyId: z.string().trim().optional(),
		mortgageTermYears: z.string().trim().optional(),
		mortgageTermMonths: z.string().trim().optional(),
		mortgageInterestOnly: z.string().trim().optional(),
		mortgageInterestOnlyEnd: z.string().trim().optional(),
		mortgageAccountName: z.string().trim().optional(),
		mortgageAccountInterestRate: z.string().trim().optional(),
		mortgageAccountOpeningBalance: z.string().trim().optional(),
		mortgagePaymentSourceChoice: z.string().trim().optional(),
		mortgagePaymentSourceName: z.string().trim().optional(),
		mortgagePaymentSourceInterestRate: z.string().trim().optional(),
		mortgagePaymentSourceOpeningBalance: z.string().trim().optional(),
		mortgageOffsetChoice: z.string().trim().optional(),
		mortgageOffsetName: z.string().trim().optional(),
		mortgageOffsetInterestRate: z.string().trim().optional(),
		mortgageOffsetOpeningBalance: z.string().trim().optional(),
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
			if (data.propertySaleDate && !/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(data.propertySaleDate)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Sale date must be MM YYYY',
					path: ['propertySaleDate']
				});
			}
			if (
				!data.propertyOwnershipExpense ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.propertyOwnershipExpense)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Ownership expense is required',
					path: ['propertyOwnershipExpense']
				});
			}
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

		if (data.assetType === 'mortgage') {
			if (!data.mortgagePropertyId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select a property to secure this mortgage',
					path: ['mortgagePropertyId']
				});
			} else {
				const parsed = uuidSchema.safeParse(data.mortgagePropertyId);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Property selection is invalid',
						path: ['mortgagePropertyId']
					});
				}
			}

			if (!data.mortgageTermYears || !/^\d+$/.test(data.mortgageTermYears)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Term remaining (years) is required',
					path: ['mortgageTermYears']
				});
			}

			if (
				data.mortgageTermMonths === undefined ||
				data.mortgageTermMonths === '' ||
				!/^\d+$/.test(data.mortgageTermMonths)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Term remaining (months) is required',
					path: ['mortgageTermMonths']
				});
			}

			const monthsValue = Number(data.mortgageTermMonths ?? 0);
			if (Number.isNaN(monthsValue) || monthsValue < 0 || monthsValue > 11) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Months must be between 0 and 11',
					path: ['mortgageTermMonths']
				});
			}

			if (data.mortgageInterestOnly === 'on') {
				if (
					!data.mortgageInterestOnlyEnd ||
					!/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(data.mortgageInterestOnlyEnd)
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Interest-only end month is required',
						path: ['mortgageInterestOnlyEnd']
					});
				}
			}

			if (!data.mortgageAccountName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Mortgage account name is required',
					path: ['mortgageAccountName']
				});
			}
			if (
				!data.mortgageAccountInterestRate ||
				!/^-?\d+(\.\d)?$/.test(data.mortgageAccountInterestRate)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Mortgage account interest rate is required',
					path: ['mortgageAccountInterestRate']
				});
			}
			if (
				!data.mortgageAccountOpeningBalance ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.mortgageAccountOpeningBalance)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Mortgage account opening balance is required',
					path: ['mortgageAccountOpeningBalance']
				});
			}

			if (!data.mortgagePaymentSourceChoice) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select a payment source account',
					path: ['mortgagePaymentSourceChoice']
				});
			} else if (data.mortgagePaymentSourceChoice === 'new') {
				if (!data.mortgagePaymentSourceName) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Payment source account name is required',
						path: ['mortgagePaymentSourceName']
					});
				}
				if (
					!data.mortgagePaymentSourceInterestRate ||
					!/^-?\d+(\.\d)?$/.test(data.mortgagePaymentSourceInterestRate)
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Payment source account interest rate is required',
						path: ['mortgagePaymentSourceInterestRate']
					});
				}
				if (
					!data.mortgagePaymentSourceOpeningBalance ||
					!/^-?\d+(\.\d{1,2})?$/.test(data.mortgagePaymentSourceOpeningBalance)
				) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Payment source account opening balance is required',
						path: ['mortgagePaymentSourceOpeningBalance']
					});
				}
			} else {
				const parsed = uuidSchema.safeParse(data.mortgagePaymentSourceChoice);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Payment source account selection is invalid',
						path: ['mortgagePaymentSourceChoice']
					});
				}
			}

			if (data.mortgageOffsetChoice && data.mortgageOffsetChoice !== 'none') {
				if (data.mortgageOffsetChoice === 'new') {
					if (!data.mortgageOffsetName) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'Offset account name is required',
							path: ['mortgageOffsetName']
						});
					}
					if (
						!data.mortgageOffsetInterestRate ||
						!/^-?\d+(\.\d)?$/.test(data.mortgageOffsetInterestRate)
					) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'Offset account interest rate is required',
							path: ['mortgageOffsetInterestRate']
						});
					}
					if (
						!data.mortgageOffsetOpeningBalance ||
						!/^-?\d+(\.\d{1,2})?$/.test(data.mortgageOffsetOpeningBalance)
					) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'Offset account opening balance is required',
							path: ['mortgageOffsetOpeningBalance']
						});
					}
				} else {
					const parsed = uuidSchema.safeParse(data.mortgageOffsetChoice);
					if (!parsed.success) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'Offset account selection is invalid',
							path: ['mortgageOffsetChoice']
						});
					}
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

	const assetType = assetTypeSchema.safeParse(event.params.assetType);
	if (!assetType.success) {
		throw redirect(303, '/assets');
	}

	const accounts = await getAccountsForScenario(scenario.id);
	const properties = (await getAssetsForScenario(scenario.id)).filter(
		(asset) => asset.asset_type === 'property'
	);
	const currentAccounts = accounts.filter((account) => account.account_type === 'current_account');

	return { scenario, assetType: assetType.data, accounts, properties, currentAccounts };
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

		const assetType = assetTypeSchema.safeParse(event.params.assetType);
		if (!assetType.success) {
			throw redirect(303, '/assets');
		}

		const formData = await event.request.formData();
		const payload = {
			assetType: assetType.data,
			name: formData.get('name'),
			startMonth: formData.get('startMonth'),
			personDob: formData.get('personDob') ?? '',
			retirementAge: formData.get('retirementAge') ?? '',
			propertyMarketValue: formData.get('propertyMarketValue') ?? '',
			propertySaleDate: formData.get('propertySaleDate') ?? '',
			propertyOwnershipExpense: formData.get('propertyOwnershipExpense') ?? '',
			mortgagePropertyId: formData.get('mortgagePropertyId') ?? '',
			mortgageTermYears: formData.get('mortgageTermYears') ?? '',
			mortgageTermMonths: formData.get('mortgageTermMonths') ?? '',
			mortgageInterestOnly: formData.get('mortgageInterestOnly') ?? '',
			mortgageInterestOnlyEnd: formData.get('mortgageInterestOnlyEnd') ?? '',
			mortgageAccountName: formData.get('mortgageAccountName') ?? '',
			mortgageAccountInterestRate: formData.get('mortgageAccountInterestRate') ?? '',
			mortgageAccountOpeningBalance: formData.get('mortgageAccountOpeningBalance') ?? '',
			mortgagePaymentSourceChoice: formData.get('mortgagePaymentSourceChoice') ?? '',
			mortgagePaymentSourceName: formData.get('mortgagePaymentSourceName') ?? '',
			mortgagePaymentSourceInterestRate: formData.get('mortgagePaymentSourceInterestRate') ?? '',
			mortgagePaymentSourceOpeningBalance:
				formData.get('mortgagePaymentSourceOpeningBalance') ?? '',
			mortgageOffsetChoice: formData.get('mortgageOffsetChoice') ?? 'none',
			mortgageOffsetName: formData.get('mortgageOffsetName') ?? '',
			mortgageOffsetInterestRate: formData.get('mortgageOffsetInterestRate') ?? '',
			mortgageOffsetOpeningBalance: formData.get('mortgageOffsetOpeningBalance') ?? '',
			employmentIncome: formData.get('employmentIncome') ?? '',
			essentialExpenses: formData.get('essentialExpenses') ?? '',
			incomeAccountChoice: formData.get('incomeAccountChoice') ?? '',
			expenseAccountChoice: formData.get('expenseAccountChoice') ?? '',
			useSameAccount: formData.get('useSameAccount') ?? '',
			incomeAccountName: formData.get('incomeAccountName') ?? '',
			incomeAccountInterestRate: formData.get('incomeAccountInterestRate') ?? '',
			incomeAccountOpeningBalance: formData.get('incomeAccountOpeningBalance') ?? '',
			expenseAccountName: formData.get('expenseAccountName') ?? '',
			expenseAccountInterestRate: formData.get('expenseAccountInterestRate') ?? '',
			expenseAccountOpeningBalance: formData.get('expenseAccountOpeningBalance') ?? ''
		};

		const parsed = createAssetSchema.safeParse(payload);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { errors, values: payload });
		}

		const {
			name,
			startMonth,
			personDob,
			retirementAge,
			propertyMarketValue,
			propertySaleDate,
			propertyOwnershipExpense,
			mortgagePropertyId,
			mortgageTermYears,
			mortgageTermMonths,
			mortgageInterestOnly,
			mortgageInterestOnlyEnd,
			mortgageAccountName,
			mortgageAccountInterestRate,
			mortgageAccountOpeningBalance,
			mortgagePaymentSourceChoice,
			mortgagePaymentSourceName,
			mortgagePaymentSourceInterestRate,
			mortgagePaymentSourceOpeningBalance,
			mortgageOffsetChoice,
			mortgageOffsetName,
			mortgageOffsetInterestRate,
			mortgageOffsetOpeningBalance,
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

		const details: Record<string, unknown> = {
			startDate: normalizeMonth(startMonth)
		};

		try {
			if (assetType.data === 'person') {
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
									interestRate: decimalOnePlaceSchema.parse(incomeAccountInterestRate ?? '0'),
									openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
								}
							: { type: 'existing', accountId: incomeAccountChoice ?? '' },
					expenseAccount:
						useSameAccount === 'on'
							? incomeAccountChoice === 'new'
								? {
										type: 'new',
										name: incomeAccountName ?? 'Income account',
										interestRate: decimalOnePlaceSchema.parse(incomeAccountInterestRate ?? '0'),
										openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
									}
								: { type: 'existing', accountId: incomeAccountChoice ?? '' }
							: expenseAccountChoice === 'new'
								? {
										type: 'new',
										name: expenseAccountName ?? 'Expense account',
										interestRate: decimalOnePlaceSchema.parse(expenseAccountInterestRate ?? '0'),
										openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
									}
								: { type: 'existing', accountId: expenseAccountChoice ?? '' }
				});
			} else if (assetType.data === 'property') {
				await createPropertyAssetWithExpense({
					scenarioId: scenario.id,
					userId,
					name,
					startDate: details.startDate as string,
					marketValue: currencySchema.parse(propertyMarketValue ?? ''),
					saleDate: propertySaleDate ? normalizeMonth(propertySaleDate) : undefined,
					ownershipExpense: currencySchema.parse(propertyOwnershipExpense ?? ''),
					expenseAccount:
						expenseAccountChoice === 'new'
							? {
									type: 'new',
									name: expenseAccountName ?? 'Expenses account',
									interestRate: decimalOnePlaceSchema.parse(expenseAccountInterestRate ?? '0'),
									openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
								}
							: { type: 'existing', accountId: expenseAccountChoice ?? '' }
				});
			} else if (assetType.data === 'mortgage') {
				details.termYears = Number(mortgageTermYears ?? 0);
				details.termMonths = Number(mortgageTermMonths ?? 0);
				details.interestOnly = mortgageInterestOnly === 'on';
				if (mortgageInterestOnly === 'on') {
					details.interestOnlyEnd = normalizeMonth(mortgageInterestOnlyEnd ?? '');
				}
				await createMortgageAssetWithAccounts({
					scenarioId: scenario.id,
					userId,
					name,
					propertyId: mortgagePropertyId ?? '',
					details,
					mortgageAccount: {
						name: mortgageAccountName ?? 'Mortgage account',
						interestRate: decimalOnePlaceSchema.parse(mortgageAccountInterestRate ?? '0'),
						openingBalance: currencySchema.parse(mortgageAccountOpeningBalance ?? '0')
					},
					paymentSourceAccount:
						mortgagePaymentSourceChoice === 'new'
							? {
									type: 'new',
									name: mortgagePaymentSourceName ?? 'Payment source account',
									interestRate: decimalOnePlaceSchema.parse(
										mortgagePaymentSourceInterestRate ?? '0'
									),
									openingBalance: currencySchema.parse(mortgagePaymentSourceOpeningBalance ?? '0')
								}
							: {
									type: 'existing',
									accountId: mortgagePaymentSourceChoice ?? ''
								},
					offsetAccount:
						mortgageOffsetChoice === 'none'
							? { type: 'none' }
							: mortgageOffsetChoice === 'new'
								? {
										type: 'new',
										name: mortgageOffsetName ?? 'Offset account',
										interestRate: decimalOnePlaceSchema.parse(
											mortgageOffsetInterestRate ?? '0'
										),
										openingBalance: currencySchema.parse(
											mortgageOffsetOpeningBalance ?? '0'
										)
									}
								: {
										type: 'existing',
										accountId: mortgageOffsetChoice ?? ''
									}
				});
			} else {
				await createAsset({
					scenarioId: scenario.id,
					assetType: assetType.data,
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

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import {
	createAsset,
	createPersonAssetWithCashflows,
	createPropertyAssetWithExpense,
	createMortgageAssetWithAccounts,
	createShareAssetWithBrokerage,
	createSuperannuationAssetWithAccount,
	getAccountsForScenario,
	getAssetsForScenario,
	getScenarioForUserById
} from '$lib/server/database';
import { parseYearMonthInput } from '$lib/yearMonth';

const monthSchema = z
	.string()
	.trim()
	.regex(/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/, { message: 'Month is required' });

const currencySchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a valid amount' })
	.transform((value) => Number(value));

const decimalUpToTwoPlacesSchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d{1,2})?$/, { message: 'Must be a number with up to 2 decimal places' })
	.transform((value) => Number(value));

const decimalUpToOnePlaceSchema = z
	.string()
	.trim()
	.regex(/^-?\d+(\.\d)?$/, { message: 'Must be a number with up to 1 decimal place' })
	.transform((value) => Number(value));

const roundToTwo = (value: number) => Number(value.toFixed(2));

const uuidSchema = z.string().uuid();
const assetTypeSchema = z.enum(['person', 'property', 'mortgage', 'superannuation', 'shares']);

const createAssetSchema = z
	.object({
		assetType: assetTypeSchema,
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		personDob: z.string().trim().optional(),
		retirementAge: z.string().trim().optional(),
		propertyMarketValue: z.string().trim().optional(),
		propertySaleDate: z.string().trim().optional(),
		propertyMarketGrowthRate: z.string().trim().optional(),
		propertyFixedSellingCosts: z.string().trim().optional(),
		propertyVariableSellingCosts: z.string().trim().optional(),
		propertyOwnershipExpense: z.string().trim().optional(),
		shareCapitalGrowthRate: z.string().trim().optional(),
		shareDividendYield: z.string().trim().optional(),
		shareDividendsTakenAsIncomeDate: z.string().trim().optional(),
		shareBrokerageAccountOpeningBalance: z.string().trim().optional(),
		sharePaysIntoAccountId: z.string().trim().optional(),
		superPersonId: z.string().trim().optional(),
		superPreservationAge: z.string().trim().optional(),
		superCapitalGrowthRate: z.string().trim().optional(),
		superManagementFeeRate: z.string().trim().optional(),
		superOpeningBalance: z.string().trim().optional(),
		superPaysIntoAccountId: z.string().trim().optional(),
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

			if (data.employmentIncome && !/^-?\d+(\.\d{1,2})?$/.test(data.employmentIncome)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Employment income must be a valid amount',
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

			if (!data.expenseAccountChoice) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select an expenses account option',
					path: ['expenseAccountChoice']
				});
			}

			if (!useSame && !data.incomeAccountChoice) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select an income account option',
					path: ['incomeAccountChoice']
				});
			}

			if (data.expenseAccountChoice === 'new') {
				if (!data.expenseAccountName) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Expense account name is required',
						path: ['expenseAccountName']
					});
				}
				if (
					!data.expenseAccountInterestRate ||
					!/^-?\d+(\.\d{1,2})?$/.test(data.expenseAccountInterestRate)
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
			} else if (data.expenseAccountChoice && data.expenseAccountChoice !== 'new') {
				const parsed = uuidSchema.safeParse(data.expenseAccountChoice);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Expense account selection is invalid',
						path: ['expenseAccountChoice']
					});
				}
			}

			if (!useSame && data.incomeAccountChoice === 'new') {
				if (!data.incomeAccountName) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Income account name is required',
						path: ['incomeAccountName']
					});
				}
				if (
					!data.incomeAccountInterestRate ||
					!/^-?\d+(\.\d{1,2})?$/.test(data.incomeAccountInterestRate)
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
			} else if (!useSame && data.incomeAccountChoice && data.incomeAccountChoice !== 'new') {
				const parsed = uuidSchema.safeParse(data.incomeAccountChoice);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Income account selection is invalid',
						path: ['incomeAccountChoice']
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
				!data.propertyMarketGrowthRate ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.propertyMarketGrowthRate)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Market growth rate is required',
					path: ['propertyMarketGrowthRate']
				});
			}
			if (
				!data.propertyFixedSellingCosts ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.propertyFixedSellingCosts)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Fixed selling costs are required',
					path: ['propertyFixedSellingCosts']
				});
			}
			if (
				!data.propertyVariableSellingCosts ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.propertyVariableSellingCosts)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Variable selling costs are required',
					path: ['propertyVariableSellingCosts']
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
					!/^-?\d+(\.\d{1,2})?$/.test(data.expenseAccountInterestRate)
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
				!/^-?\d+(\.\d{1,2})?$/.test(data.mortgageAccountInterestRate)
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
					!/^-?\d+(\.\d{1,2})?$/.test(data.mortgagePaymentSourceInterestRate)
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

			if (
				data.mortgageOffsetChoice &&
				data.mortgageOffsetChoice !== 'none' &&
				data.mortgageOffsetChoice !== 'same_as_payment_source'
			) {
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
						!/^-?\d+(\.\d{1,2})?$/.test(data.mortgageOffsetInterestRate)
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

		if (data.assetType === 'shares') {
			if (
				!data.shareCapitalGrowthRate ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.shareCapitalGrowthRate)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Capital growth rate is required',
					path: ['shareCapitalGrowthRate']
				});
			}
			if (!data.shareDividendYield || !/^-?\d+(\.\d{1,2})?$/.test(data.shareDividendYield)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Dividend yield is required',
					path: ['shareDividendYield']
				});
			}
			if (
				!data.shareDividendsTakenAsIncomeDate ||
				!/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(data.shareDividendsTakenAsIncomeDate)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Dividend income date must be MM YYYY',
					path: ['shareDividendsTakenAsIncomeDate']
				});
			}
			if (
				data.shareBrokerageAccountOpeningBalance === undefined ||
				data.shareBrokerageAccountOpeningBalance === '' ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.shareBrokerageAccountOpeningBalance)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Brokerage opening balance is required',
					path: ['shareBrokerageAccountOpeningBalance']
				});
			}
			if (!data.sharePaysIntoAccountId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select a pays into cash account',
					path: ['sharePaysIntoAccountId']
				});
			} else {
				const parsed = uuidSchema.safeParse(data.sharePaysIntoAccountId);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Pays into account selection is invalid',
						path: ['sharePaysIntoAccountId']
					});
				}
			}
		}
		if (data.assetType === 'superannuation') {
			if (!data.superPersonId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select a person asset',
					path: ['superPersonId']
				});
			} else {
				const parsed = uuidSchema.safeParse(data.superPersonId);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Person selection is invalid',
						path: ['superPersonId']
					});
				}
			}
			if (!data.superPreservationAge || !/^\d+$/.test(data.superPreservationAge)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Preservation age must be a whole number',
					path: ['superPreservationAge']
				});
			}
			if (
				!data.superCapitalGrowthRate ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.superCapitalGrowthRate)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Capital growth rate is required',
					path: ['superCapitalGrowthRate']
				});
			}
			if (!data.superManagementFeeRate || !/^-?\d+(\.\d{1,2})?$/.test(data.superManagementFeeRate)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Management fee rate is required',
					path: ['superManagementFeeRate']
				});
			}
			if (
				data.superOpeningBalance === undefined ||
				data.superOpeningBalance === '' ||
				!/^-?\d+(\.\d{1,2})?$/.test(data.superOpeningBalance)
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Super opening balance is required',
					path: ['superOpeningBalance']
				});
			}
			if (!data.superPaysIntoAccountId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select a pays into cash account',
					path: ['superPaysIntoAccountId']
				});
			} else {
				const parsed = uuidSchema.safeParse(data.superPaysIntoAccountId);
				if (!parsed.success) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Pays into account selection is invalid',
						path: ['superPaysIntoAccountId']
					});
				}
			}
		}
	});

const normalizeMonth = (value: string) => {
	const parsedValue = parseYearMonthInput(value);
	if (parsedValue === null) {
		throw new Error('Invalid month format');
	}
	return parsedValue;
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
	const people = (await getAssetsForScenario(scenario.id)).filter(
		(asset) => asset.asset_type === 'person'
	);
	const cashAccounts = accounts.filter((account) => account.account_type === 'cash_account');

	return { scenario, assetType: assetType.data, accounts, properties, people, cashAccounts };
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
			propertyMarketGrowthRate: formData.get('propertyMarketGrowthRate') ?? '5',
			propertyFixedSellingCosts: formData.get('propertyFixedSellingCosts') ?? '10000',
			propertyVariableSellingCosts: formData.get('propertyVariableSellingCosts') ?? '1.65',
			propertyOwnershipExpense: formData.get('propertyOwnershipExpense') ?? '',
			shareCapitalGrowthRate: formData.get('shareCapitalGrowthRate') ?? '',
			shareDividendYield: formData.get('shareDividendYield') ?? '',
			shareDividendsTakenAsIncomeDate: formData.get('shareDividendsTakenAsIncomeDate') ?? '',
			shareBrokerageAccountOpeningBalance: formData.get('shareBrokerageAccountOpeningBalance') ?? '',
			sharePaysIntoAccountId: formData.get('sharePaysIntoAccountId') ?? '',
			superPersonId: formData.get('superPersonId') ?? '',
			superPreservationAge: formData.get('superPreservationAge') ?? '',
			superCapitalGrowthRate: formData.get('superCapitalGrowthRate') ?? '',
			superManagementFeeRate: formData.get('superManagementFeeRate') ?? '',
			superOpeningBalance: formData.get('superOpeningBalance') ?? '',
			superPaysIntoAccountId: formData.get('superPaysIntoAccountId') ?? '',
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
			propertyMarketGrowthRate,
			propertyFixedSellingCosts,
			propertyVariableSellingCosts,
			propertyOwnershipExpense,
			shareCapitalGrowthRate,
			shareDividendYield,
			shareDividendsTakenAsIncomeDate,
			shareBrokerageAccountOpeningBalance,
			sharePaysIntoAccountId,
			superPersonId,
			superPreservationAge,
			superCapitalGrowthRate,
			superManagementFeeRate,
			superOpeningBalance,
			superPaysIntoAccountId,
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

		const startDate = normalizeMonth(startMonth);

		try {
			if (assetType.data === 'person') {
				await createPersonAssetWithCashflows({
					scenarioId: scenario.id,
					userId,
					name,
					dob: normalizeMonth(personDob ?? ''),
					retirementAge: Number(retirementAge),
					startDate,
					employmentIncome: employmentIncome ? currencySchema.parse(employmentIncome) : 0,
					essentialExpenses: currencySchema.parse(essentialExpenses ?? ''),
					expenseAccount:
						expenseAccountChoice === 'new'
							? {
									type: 'new',
									name: expenseAccountName ?? 'Expense account',
									interestRate: roundToTwo(
										decimalUpToTwoPlacesSchema.parse(expenseAccountInterestRate ?? '0')
									),
									openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
								}
							: { type: 'existing', accountId: expenseAccountChoice ?? '' },
					incomeAccount:
						useSameAccount === 'on'
							? expenseAccountChoice === 'new'
								? {
										type: 'new',
										name: expenseAccountName ?? 'Expense account',
										interestRate: roundToTwo(
											decimalUpToTwoPlacesSchema.parse(expenseAccountInterestRate ?? '0')
										),
										openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
									}
								: { type: 'existing', accountId: expenseAccountChoice ?? '' }
							: incomeAccountChoice === 'new'
								? {
										type: 'new',
										name: incomeAccountName ?? 'Income account',
										interestRate: roundToTwo(
											decimalUpToTwoPlacesSchema.parse(incomeAccountInterestRate ?? '0')
										),
										openingBalance: currencySchema.parse(incomeAccountOpeningBalance ?? '0')
									}
								: { type: 'existing', accountId: incomeAccountChoice ?? '' }
				});
			} else if (assetType.data === 'property') {
				await createPropertyAssetWithExpense({
					scenarioId: scenario.id,
					userId,
					name,
					startDate,
					marketValue: currencySchema.parse(propertyMarketValue ?? ''),
					marketGrowthRate: decimalUpToOnePlaceSchema.parse(propertyMarketGrowthRate ?? '5'),
					fixedSellingCosts: currencySchema.parse(propertyFixedSellingCosts ?? '10000'),
					variableSellingCosts: decimalUpToTwoPlacesSchema.parse(
						propertyVariableSellingCosts ?? '1.65'
					),
					saleDate: propertySaleDate ? normalizeMonth(propertySaleDate) : undefined,
					ownershipExpense: currencySchema.parse(propertyOwnershipExpense ?? ''),
					expenseAccount:
						expenseAccountChoice === 'new'
							? {
									type: 'new',
									name: expenseAccountName ?? 'Expenses account',
									interestRate: roundToTwo(
										decimalUpToTwoPlacesSchema.parse(expenseAccountInterestRate ?? '0')
									),
									openingBalance: currencySchema.parse(expenseAccountOpeningBalance ?? '0')
								}
							: { type: 'existing', accountId: expenseAccountChoice ?? '' }
				});
			} else if (assetType.data === 'mortgage') {
				const mortgageDetails: Record<string, unknown> = {
					termYears: Number(mortgageTermYears ?? 0),
					termMonths: Number(mortgageTermMonths ?? 0),
					interestOnly: mortgageInterestOnly === 'on'
				};
				if (mortgageInterestOnly === 'on') {
					mortgageDetails.interestOnlyEnd = normalizeMonth(mortgageInterestOnlyEnd ?? '');
				}
				await createMortgageAssetWithAccounts({
					scenarioId: scenario.id,
					userId,
					name,
					startDate,
					propertyId: mortgagePropertyId ?? '',
					details: mortgageDetails,
					mortgageAccount: {
						name: mortgageAccountName ?? 'Mortgage account',
						interestRate: roundToTwo(
							decimalUpToTwoPlacesSchema.parse(mortgageAccountInterestRate ?? '0')
						),
						openingBalance: currencySchema.parse(mortgageAccountOpeningBalance ?? '0')
					},
					paymentSourceAccount:
						mortgagePaymentSourceChoice === 'new'
							? {
									type: 'new',
									name: mortgagePaymentSourceName ?? 'Payment source account',
									interestRate: roundToTwo(
										decimalUpToTwoPlacesSchema.parse(
											mortgagePaymentSourceInterestRate ?? '0'
										)
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
							: mortgageOffsetChoice === 'same_as_payment_source'
								? { type: 'same_as_payment_source' }
							: mortgageOffsetChoice === 'new'
								? {
										type: 'new',
										name: mortgageOffsetName ?? 'Offset account',
										interestRate: roundToTwo(
											decimalUpToTwoPlacesSchema.parse(
												mortgageOffsetInterestRate ?? '0'
											)
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
			} else if (assetType.data === 'shares') {
				const cashAccountIds = new Set(
					(await getAccountsForScenario(scenario.id))
						.filter((account) => account.account_type === 'cash_account')
						.map((account) => account.id)
				);
				if (!cashAccountIds.has(sharePaysIntoAccountId ?? '')) {
					const errors: Record<string, string[]> = {
						sharePaysIntoAccountId: ['Select a valid cash account']
					};
					return fail(400, {
						errors,
						values: payload
					});
				}
				await createShareAssetWithBrokerage({
					scenarioId: scenario.id,
					name,
					startDate,
					capitalGrowthRate: decimalUpToTwoPlacesSchema.parse(shareCapitalGrowthRate ?? '0'),
					dividendYield: decimalUpToTwoPlacesSchema.parse(shareDividendYield ?? '0'),
					dividendsTakenAsIncomeDate: normalizeMonth(shareDividendsTakenAsIncomeDate ?? ''),
					brokerageOpeningBalance: currencySchema.parse(shareBrokerageAccountOpeningBalance ?? '0'),
					paysIntoAccountId: sharePaysIntoAccountId ?? ''
				});
			} else if (assetType.data === 'superannuation') {
				const personAssets = (await getAssetsForScenario(scenario.id)).filter(
					(asset) => asset.asset_type === 'person'
				);
				if (!personAssets.some((person) => person.id === superPersonId)) {
					const errors: Record<string, string[]> = {
						superPersonId: ['Select a valid person asset']
					};
					return fail(400, {
						errors,
						values: payload
					});
				}
				const cashAccountIds = new Set(
					(await getAccountsForScenario(scenario.id))
						.filter((account) => account.account_type === 'cash_account')
						.map((account) => account.id)
				);
				if (!cashAccountIds.has(superPaysIntoAccountId ?? '')) {
					const errors: Record<string, string[]> = {
						superPaysIntoAccountId: ['Select a valid cash account']
					};
					return fail(400, {
						errors,
						values: payload
					});
				}
				await createSuperannuationAssetWithAccount({
					scenarioId: scenario.id,
					name,
					startDate,
					personId: superPersonId ?? '',
					paysIntoAccountId: superPaysIntoAccountId ?? '',
					preservationAge: Number(superPreservationAge ?? 60),
					capitalGrowthRate: decimalUpToTwoPlacesSchema.parse(superCapitalGrowthRate ?? '0'),
					managementFeeRate: decimalUpToTwoPlacesSchema.parse(superManagementFeeRate ?? '0'),
					openingBalance: currencySchema.parse(superOpeningBalance ?? '0')
				});
			} else {
				await createAsset({
					scenarioId: scenario.id,
					assetType: assetType.data,
					name,
					startDate,
					details: {}
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

import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { z } from 'zod';
import {
	createPersonAssetWithCashflows,
	createPropertyAssetWithExpense,
	createMortgageAssetWithAccounts,
	createShareAssetWithBrokerage,
	createSuperannuationAssetWithAccount,
	getAccountsForScenario,
	getAssetsForScenario,
	getScenarioForUserById
} from '$lib/server/database';
import { requireYearMonthInput } from '$lib/yearMonth';

// --- primitive schemas ---

const monthPattern = /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/;
const currencyPattern = /^-?\d+(\.\d{1,2})?$/;
const dec2Pattern = /^-?\d+(\.\d{1,2})?$/;
const dec1Pattern = /^-?\d+(\.\d)?$/;

const monthSchema = z
	.string()
	.trim()
	.regex(monthPattern, { message: 'Month is required' });

const currencySchema = z
	.string()
	.trim()
	.regex(currencyPattern, { message: 'Must be a valid amount' })
	.transform(Number);

const dec2Schema = z
	.string()
	.trim()
	.regex(dec2Pattern, { message: 'Must be a number with up to 2 decimal places' })
	.transform(Number);

const dec1Schema = z
	.string()
	.trim()
	.regex(dec1Pattern, { message: 'Must be a number with up to 1 decimal place' })
	.transform(Number);

const roundToTwo = (value: number) => Number(value.toFixed(2));
const uuidSchema = z.string().uuid();
const assetTypeSchema = z.enum(['person', 'property', 'mortgage', 'superannuation', 'shares']);
const propertyUseSchema = z.enum(['primary_residence', 'investment_property']);

// --- shared account-choice helpers ---

function validateNewAccount(
	name: string | undefined,
	rate: string | undefined,
	balance: string | undefined,
	ctx: z.RefinementCtx,
	paths: { name: string; rate: string; balance: string },
	label: string
) {
	if (!name) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} account name is required`, path: [paths.name] });
	}
	if (!rate || !dec2Pattern.test(rate)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} account interest rate is required`, path: [paths.rate] });
	}
	if (!balance || !dec2Pattern.test(balance)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} account opening balance is required`, path: [paths.balance] });
	}
}

function resolveAccountInput(
	choice: string,
	name: string | undefined,
	rate: string | undefined,
	balance: string | undefined,
	defaultName: string
) {
	if (choice === 'new') {
		return {
			type: 'new' as const,
			name: name || defaultName,
			interestRate: roundToTwo(dec2Schema.parse(rate ?? '0')),
			openingBalance: currencySchema.parse(balance ?? '0')
		};
	}
	return { type: 'existing' as const, accountId: choice };
}

// --- per-type schemas ---

const personSchema = z
	.object({
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		personDob: z.string().trim(),
		retirementAge: z.string().trim(),
		employmentIncome: z.string().trim(),
		essentialExpenses: z.string().trim(),
		useSameAccount: z.string().trim(),
		expenseAccountChoice: z.string().trim(),
		expenseAccountName: z.string().trim().optional(),
		expenseAccountInterestRate: z.string().trim().optional(),
		expenseAccountOpeningBalance: z.string().trim().optional(),
		incomeAccountChoice: z.string().trim(),
		incomeAccountName: z.string().trim().optional(),
		incomeAccountInterestRate: z.string().trim().optional(),
		incomeAccountOpeningBalance: z.string().trim().optional()
	})
	.superRefine((data, ctx) => {
		if (!monthPattern.test(data.personDob)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date of birth month is required', path: ['personDob'] });
		}
		if (!/^\d+$/.test(data.retirementAge)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Retirement age must be a whole number', path: ['retirementAge'] });
		}
		if (data.employmentIncome && !currencyPattern.test(data.employmentIncome)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Employment income must be a valid amount', path: ['employmentIncome'] });
		}
		if (!data.essentialExpenses || !currencyPattern.test(data.essentialExpenses)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Essential living expenses are required', path: ['essentialExpenses'] });
		}
		if (!data.expenseAccountChoice) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select an expenses account option', path: ['expenseAccountChoice'] });
		} else if (data.expenseAccountChoice === 'new') {
			validateNewAccount(data.expenseAccountName, data.expenseAccountInterestRate, data.expenseAccountOpeningBalance, ctx, { name: 'expenseAccountName', rate: 'expenseAccountInterestRate', balance: 'expenseAccountOpeningBalance' }, 'Expense');
		} else if (!uuidSchema.safeParse(data.expenseAccountChoice).success) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expense account selection is invalid', path: ['expenseAccountChoice'] });
		}
		if (data.useSameAccount !== 'on') {
			if (!data.incomeAccountChoice) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select an income account option', path: ['incomeAccountChoice'] });
			} else if (data.incomeAccountChoice === 'new') {
				validateNewAccount(data.incomeAccountName, data.incomeAccountInterestRate, data.incomeAccountOpeningBalance, ctx, { name: 'incomeAccountName', rate: 'incomeAccountInterestRate', balance: 'incomeAccountOpeningBalance' }, 'Income');
			} else if (!uuidSchema.safeParse(data.incomeAccountChoice).success) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Income account selection is invalid', path: ['incomeAccountChoice'] });
			}
		}
	});

const propertySchema = z
	.object({
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		propertyUse: z.string().trim(),
		propertyMarketValue: z.string().trim(),
		propertySaleDate: z.string().trim(),
		propertyMarketGrowthRate: z.string().trim(),
		propertyFixedSellingCosts: z.string().trim(),
		propertyVariableSellingCosts: z.string().trim(),
		propertyOwnershipExpense: z.string().trim(),
		expenseAccountChoice: z.string().trim(),
		expenseAccountName: z.string().trim().optional(),
		expenseAccountInterestRate: z.string().trim().optional(),
		expenseAccountOpeningBalance: z.string().trim().optional()
	})
	.superRefine((data, ctx) => {
		if (data.propertyUse && !propertyUseSchema.safeParse(data.propertyUse).success) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Property type is invalid', path: ['propertyUse'] });
		}
		if (!data.propertyMarketValue || !currencyPattern.test(data.propertyMarketValue)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Market value is required', path: ['propertyMarketValue'] });
		}
		if (data.propertySaleDate && !monthPattern.test(data.propertySaleDate)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Sale date must be MM YYYY', path: ['propertySaleDate'] });
		}
		if (!data.propertyMarketGrowthRate || !dec2Pattern.test(data.propertyMarketGrowthRate)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Market growth rate is required', path: ['propertyMarketGrowthRate'] });
		}
		if (!data.propertyFixedSellingCosts || !currencyPattern.test(data.propertyFixedSellingCosts)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Fixed selling costs are required', path: ['propertyFixedSellingCosts'] });
		}
		if (!data.propertyVariableSellingCosts || !currencyPattern.test(data.propertyVariableSellingCosts)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Variable selling costs are required', path: ['propertyVariableSellingCosts'] });
		}
		if (!data.propertyOwnershipExpense || !currencyPattern.test(data.propertyOwnershipExpense)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ownership expense is required', path: ['propertyOwnershipExpense'] });
		}
		if (!data.expenseAccountChoice) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select an expenses account option', path: ['expenseAccountChoice'] });
		} else if (data.expenseAccountChoice === 'new') {
			validateNewAccount(data.expenseAccountName, data.expenseAccountInterestRate, data.expenseAccountOpeningBalance, ctx, { name: 'expenseAccountName', rate: 'expenseAccountInterestRate', balance: 'expenseAccountOpeningBalance' }, 'Expense');
		} else if (!uuidSchema.safeParse(data.expenseAccountChoice).success) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expense account selection is invalid', path: ['expenseAccountChoice'] });
		}
	});

const mortgageSchema = z
	.object({
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		mortgagePropertyId: z.string().trim(),
		mortgageTermYears: z.string().trim(),
		mortgageTermMonths: z.string().trim(),
		mortgageInterestOnly: z.string().trim(),
		mortgageInterestOnlyEnd: z.string().trim(),
		mortgageAccountName: z.string().trim(),
		mortgageAccountInterestRate: z.string().trim(),
		mortgageAccountOpeningBalance: z.string().trim(),
		mortgagePaymentSourceChoice: z.string().trim(),
		mortgagePaymentSourceName: z.string().trim().optional(),
		mortgagePaymentSourceInterestRate: z.string().trim().optional(),
		mortgagePaymentSourceOpeningBalance: z.string().trim().optional(),
		mortgageOffsetChoice: z.string().trim(),
		mortgageOffsetName: z.string().trim().optional(),
		mortgageOffsetInterestRate: z.string().trim().optional(),
		mortgageOffsetOpeningBalance: z.string().trim().optional()
	})
	.superRefine((data, ctx) => {
		if (!data.mortgagePropertyId) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a property to secure this mortgage', path: ['mortgagePropertyId'] });
		} else if (!uuidSchema.safeParse(data.mortgagePropertyId).success) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Property selection is invalid', path: ['mortgagePropertyId'] });
		}
		if (!data.mortgageTermYears || !/^\d+$/.test(data.mortgageTermYears)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Term remaining (years) is required', path: ['mortgageTermYears'] });
		}
		if (!data.mortgageTermMonths || !/^\d+$/.test(data.mortgageTermMonths)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Term remaining (months) is required', path: ['mortgageTermMonths'] });
		} else {
			const months = Number(data.mortgageTermMonths);
			if (months < 0 || months > 11) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Months must be between 0 and 11', path: ['mortgageTermMonths'] });
			}
		}
		if (data.mortgageInterestOnly === 'on' && !monthPattern.test(data.mortgageInterestOnlyEnd)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Interest-only end month is required', path: ['mortgageInterestOnlyEnd'] });
		}
		if (!data.mortgageAccountName) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Mortgage account name is required', path: ['mortgageAccountName'] });
		}
		if (!data.mortgageAccountInterestRate || !dec2Pattern.test(data.mortgageAccountInterestRate)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Mortgage account interest rate is required', path: ['mortgageAccountInterestRate'] });
		}
		if (!data.mortgageAccountOpeningBalance || !currencyPattern.test(data.mortgageAccountOpeningBalance)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Mortgage account opening balance is required', path: ['mortgageAccountOpeningBalance'] });
		}
		if (!data.mortgagePaymentSourceChoice) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a payment source account', path: ['mortgagePaymentSourceChoice'] });
		} else if (data.mortgagePaymentSourceChoice === 'new') {
			validateNewAccount(data.mortgagePaymentSourceName, data.mortgagePaymentSourceInterestRate, data.mortgagePaymentSourceOpeningBalance, ctx, { name: 'mortgagePaymentSourceName', rate: 'mortgagePaymentSourceInterestRate', balance: 'mortgagePaymentSourceOpeningBalance' }, 'Payment source');
		} else if (!uuidSchema.safeParse(data.mortgagePaymentSourceChoice).success) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Payment source account selection is invalid', path: ['mortgagePaymentSourceChoice'] });
		}
		const offset = data.mortgageOffsetChoice;
		if (offset && offset !== 'none' && offset !== 'same_as_payment_source') {
			if (offset === 'new') {
				validateNewAccount(data.mortgageOffsetName, data.mortgageOffsetInterestRate, data.mortgageOffsetOpeningBalance, ctx, { name: 'mortgageOffsetName', rate: 'mortgageOffsetInterestRate', balance: 'mortgageOffsetOpeningBalance' }, 'Offset');
			} else if (!uuidSchema.safeParse(offset).success) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Offset account selection is invalid', path: ['mortgageOffsetChoice'] });
			}
		}
	});

const sharesSchema = z
	.object({
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		shareCapitalGrowthRate: z.string().trim().regex(dec1Pattern, { message: 'Capital growth rate is required' }),
		shareDividendYield: z.string().trim().regex(dec1Pattern, { message: 'Dividend yield is required' }),
		shareDividendsTakenAsIncomeDate: z
			.string()
			.trim()
			.regex(monthPattern, { message: 'Dividend income date must be MM YYYY' }),
		shareBrokerageAccountOpeningBalance: z
			.string()
			.trim()
			.regex(currencyPattern, { message: 'Brokerage opening balance is required' }),
		sharePaysIntoAccountId: z
			.string()
			.trim()
			.min(1, 'Select a pays into cash account')
			.refine((v) => uuidSchema.safeParse(v).success, { message: 'Pays into account selection is invalid' })
	});

const superannuationSchema = z
	.object({
		name: z.string().trim().min(1, 'Asset name is required'),
		startMonth: monthSchema,
		superPersonId: z
			.string()
			.trim()
			.min(1, 'Select a person asset')
			.refine((v) => uuidSchema.safeParse(v).success, { message: 'Person selection is invalid' }),
		superPreservationAge: z
			.string()
			.trim()
			.regex(/^\d+$/, { message: 'Preservation age must be a whole number' }),
		superCapitalGrowthRate: z
			.string()
			.trim()
			.regex(dec2Pattern, { message: 'Capital growth rate is required' }),
		superManagementFeeRate: z
			.string()
			.trim()
			.regex(dec2Pattern, { message: 'Management fee rate is required' }),
		superOpeningBalance: z
			.string()
			.trim()
			.regex(currencyPattern, { message: 'Super opening balance is required' }),
		superPaysIntoAccountId: z
			.string()
			.trim()
			.min(1, 'Select a pays into cash account')
			.refine((v) => uuidSchema.safeParse(v).success, { message: 'Pays into account selection is invalid' })
	});

// --- per-type create handlers ---

async function handlePerson(
	data: z.infer<typeof personSchema>,
	scenarioId: string,
	userId: string
) {
	const expenseAccount = resolveAccountInput(
		data.expenseAccountChoice,
		data.expenseAccountName,
		data.expenseAccountInterestRate,
		data.expenseAccountOpeningBalance,
		'Expense account'
	);
	const incomeAccount =
		data.useSameAccount === 'on'
			? expenseAccount
			: resolveAccountInput(
					data.incomeAccountChoice,
					data.incomeAccountName,
					data.incomeAccountInterestRate,
					data.incomeAccountOpeningBalance,
					'Income account'
				);
	await createPersonAssetWithCashflows({
		scenarioId,
		userId,
		name: data.name,
		dob: requireYearMonthInput(data.personDob),
		retirementAge: Number(data.retirementAge),
		startDate: requireYearMonthInput(data.startMonth),
		employmentIncome: data.employmentIncome ? currencySchema.parse(data.employmentIncome) : 0,
		essentialExpenses: currencySchema.parse(data.essentialExpenses),
		expenseAccount,
		incomeAccount
	});
}

async function handleProperty(
	data: z.infer<typeof propertySchema>,
	scenarioId: string,
	userId: string,
	hasPrimaryResidence: boolean
) {
	const resolvedPropertyUse = propertyUseSchema.safeParse(data.propertyUse).success
		? (data.propertyUse as 'primary_residence' | 'investment_property')
		: hasPrimaryResidence
			? 'investment_property'
			: 'primary_residence';
	await createPropertyAssetWithExpense({
		scenarioId,
		userId,
		name: data.name,
		startDate: requireYearMonthInput(data.startMonth),
		propertyUse: resolvedPropertyUse,
		marketValue: currencySchema.parse(data.propertyMarketValue),
		marketGrowthRate: dec1Schema.parse(data.propertyMarketGrowthRate),
		fixedSellingCosts: currencySchema.parse(data.propertyFixedSellingCosts),
		variableSellingCosts: dec2Schema.parse(data.propertyVariableSellingCosts),
		saleDate: data.propertySaleDate ? requireYearMonthInput(data.propertySaleDate) : undefined,
		ownershipExpense: currencySchema.parse(data.propertyOwnershipExpense),
		expenseAccount: resolveAccountInput(
			data.expenseAccountChoice,
			data.expenseAccountName,
			data.expenseAccountInterestRate,
			data.expenseAccountOpeningBalance,
			'Expenses account'
		)
	});
}

async function handleMortgage(
	data: z.infer<typeof mortgageSchema>,
	scenarioId: string,
	userId: string
) {
	const details: Record<string, unknown> = {
		termYears: Number(data.mortgageTermYears),
		termMonths: Number(data.mortgageTermMonths),
		interestOnly: data.mortgageInterestOnly === 'on'
	};
	if (data.mortgageInterestOnly === 'on') {
		details.interestOnlyEnd = requireYearMonthInput(data.mortgageInterestOnlyEnd);
	}
	const offset = data.mortgageOffsetChoice;
	await createMortgageAssetWithAccounts({
		scenarioId,
		userId,
		name: data.name,
		startDate: requireYearMonthInput(data.startMonth),
		propertyId: data.mortgagePropertyId,
		details,
		mortgageAccount: {
			name: data.mortgageAccountName || 'Mortgage account',
			interestRate: roundToTwo(dec2Schema.parse(data.mortgageAccountInterestRate)),
			openingBalance: currencySchema.parse(data.mortgageAccountOpeningBalance)
		},
		paymentSourceAccount: resolveAccountInput(
			data.mortgagePaymentSourceChoice,
			data.mortgagePaymentSourceName,
			data.mortgagePaymentSourceInterestRate,
			data.mortgagePaymentSourceOpeningBalance,
			'Payment source account'
		),
		offsetAccount:
			offset === 'none'
				? { type: 'none' }
				: offset === 'same_as_payment_source'
					? { type: 'same_as_payment_source' }
					: resolveAccountInput(
							offset,
							data.mortgageOffsetName,
							data.mortgageOffsetInterestRate,
							data.mortgageOffsetOpeningBalance,
							'Offset account'
						)
	});
}

async function handleShares(
	data: z.infer<typeof sharesSchema>,
	scenarioId: string,
	rawValues: Record<string, string>
) {
	const cashAccountIds = new Set(
		(await getAccountsForScenario(scenarioId))
			.filter((account) => account.account_type === 'cash_account')
			.map((account) => account.id)
	);
	if (!cashAccountIds.has(data.sharePaysIntoAccountId)) {
		return fail(400, { errors: { sharePaysIntoAccountId: ['Select a valid cash account'] }, values: rawValues });
	}
	await createShareAssetWithBrokerage({
		scenarioId,
		name: data.name,
		startDate: requireYearMonthInput(data.startMonth),
		capitalGrowthRate: dec1Schema.parse(data.shareCapitalGrowthRate),
		dividendYield: dec1Schema.parse(data.shareDividendYield),
		dividendsTakenAsIncomeDate: requireYearMonthInput(data.shareDividendsTakenAsIncomeDate),
		brokerageOpeningBalance: currencySchema.parse(data.shareBrokerageAccountOpeningBalance),
		paysIntoAccountId: data.sharePaysIntoAccountId
	});
}

async function handleSuperannuation(
	data: z.infer<typeof superannuationSchema>,
	scenarioId: string,
	rawValues: Record<string, string>
) {
	const [personAssets, accounts] = await Promise.all([
		getAssetsForScenario(scenarioId),
		getAccountsForScenario(scenarioId)
	]);
	if (!personAssets.some((a) => a.asset_type === 'person' && a.id === data.superPersonId)) {
		return fail(400, { errors: { superPersonId: ['Select a valid person asset'] }, values: rawValues });
	}
	const cashAccountIds = new Set(
		accounts
			.filter((account) => account.account_type === 'cash_account')
			.map((account) => account.id)
	);
	if (!cashAccountIds.has(data.superPaysIntoAccountId)) {
		return fail(400, { errors: { superPaysIntoAccountId: ['Select a valid cash account'] }, values: rawValues });
	}
	await createSuperannuationAssetWithAccount({
		scenarioId,
		name: data.name,
		startDate: requireYearMonthInput(data.startMonth),
		personId: data.superPersonId,
		paysIntoAccountId: data.superPaysIntoAccountId,
		preservationAge: Number(data.superPreservationAge),
		capitalGrowthRate: dec2Schema.parse(data.superCapitalGrowthRate),
		managementFeeRate: dec2Schema.parse(data.superManagementFeeRate),
		openingBalance: currencySchema.parse(data.superOpeningBalance)
	});
}

// --- action ---

export const actions: Actions = {
	default: async (event) => {
		const userId = event.locals.appUserId;

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
			throw redirect(303, '/dashboard');
		}

		const formData = await event.request.formData();
		const rawValues = {
			name: String(formData.get('name') ?? ''),
			startMonth: String(formData.get('startMonth') ?? ''),
			personDob: String(formData.get('personDob') ?? ''),
			retirementAge: String(formData.get('retirementAge') ?? ''),
			propertyUse: String(formData.get('propertyUse') ?? ''),
			propertyMarketValue: String(formData.get('propertyMarketValue') ?? ''),
			propertySaleDate: String(formData.get('propertySaleDate') ?? ''),
			propertyMarketGrowthRate: String(formData.get('propertyMarketGrowthRate') ?? '5'),
			propertyFixedSellingCosts: String(formData.get('propertyFixedSellingCosts') ?? '10000'),
			propertyVariableSellingCosts: String(formData.get('propertyVariableSellingCosts') ?? '1.65'),
			propertyOwnershipExpense: String(formData.get('propertyOwnershipExpense') ?? ''),
			shareCapitalGrowthRate: String(formData.get('shareCapitalGrowthRate') ?? ''),
			shareDividendYield: String(formData.get('shareDividendYield') ?? ''),
			shareDividendsTakenAsIncomeDate: String(formData.get('shareDividendsTakenAsIncomeDate') ?? ''),
			shareBrokerageAccountOpeningBalance: String(formData.get('shareBrokerageAccountOpeningBalance') ?? ''),
			sharePaysIntoAccountId: String(formData.get('sharePaysIntoAccountId') ?? ''),
			superPersonId: String(formData.get('superPersonId') ?? ''),
			superPreservationAge: String(formData.get('superPreservationAge') ?? ''),
			superCapitalGrowthRate: String(formData.get('superCapitalGrowthRate') ?? ''),
			superManagementFeeRate: String(formData.get('superManagementFeeRate') ?? ''),
			superOpeningBalance: String(formData.get('superOpeningBalance') ?? ''),
			superPaysIntoAccountId: String(formData.get('superPaysIntoAccountId') ?? ''),
			mortgagePropertyId: String(formData.get('mortgagePropertyId') ?? ''),
			mortgageTermYears: String(formData.get('mortgageTermYears') ?? ''),
			mortgageTermMonths: String(formData.get('mortgageTermMonths') ?? ''),
			mortgageInterestOnly: String(formData.get('mortgageInterestOnly') ?? ''),
			mortgageInterestOnlyEnd: String(formData.get('mortgageInterestOnlyEnd') ?? ''),
			mortgageAccountName: String(formData.get('mortgageAccountName') ?? ''),
			mortgageAccountInterestRate: String(formData.get('mortgageAccountInterestRate') ?? ''),
			mortgageAccountOpeningBalance: String(formData.get('mortgageAccountOpeningBalance') ?? ''),
			mortgagePaymentSourceChoice: String(formData.get('mortgagePaymentSourceChoice') ?? ''),
			mortgagePaymentSourceName: String(formData.get('mortgagePaymentSourceName') ?? ''),
			mortgagePaymentSourceInterestRate: String(formData.get('mortgagePaymentSourceInterestRate') ?? ''),
			mortgagePaymentSourceOpeningBalance: String(formData.get('mortgagePaymentSourceOpeningBalance') ?? ''),
			mortgageOffsetChoice: String(formData.get('mortgageOffsetChoice') ?? 'none'),
			mortgageOffsetName: String(formData.get('mortgageOffsetName') ?? ''),
			mortgageOffsetInterestRate: String(formData.get('mortgageOffsetInterestRate') ?? ''),
			mortgageOffsetOpeningBalance: String(formData.get('mortgageOffsetOpeningBalance') ?? ''),
			employmentIncome: String(formData.get('employmentIncome') ?? ''),
			essentialExpenses: String(formData.get('essentialExpenses') ?? ''),
			incomeAccountChoice: String(formData.get('incomeAccountChoice') ?? ''),
			expenseAccountChoice: String(formData.get('expenseAccountChoice') ?? ''),
			useSameAccount: String(formData.get('useSameAccount') ?? ''),
			incomeAccountName: String(formData.get('incomeAccountName') ?? ''),
			incomeAccountInterestRate: String(formData.get('incomeAccountInterestRate') ?? ''),
			incomeAccountOpeningBalance: String(formData.get('incomeAccountOpeningBalance') ?? ''),
			expenseAccountName: String(formData.get('expenseAccountName') ?? ''),
			expenseAccountInterestRate: String(formData.get('expenseAccountInterestRate') ?? ''),
			expenseAccountOpeningBalance: String(formData.get('expenseAccountOpeningBalance') ?? '')
		};

		try {
			switch (assetType.data) {
				case 'person': {
					const result = personSchema.safeParse(rawValues);
					if (!result.success) {
						return fail(400, { errors: result.error.flatten().fieldErrors, values: rawValues });
					}
					await handlePerson(result.data, scenario.id, userId);
					break;
				}
				case 'property': {
					const result = propertySchema.safeParse(rawValues);
					if (!result.success) {
						return fail(400, { errors: result.error.flatten().fieldErrors, values: rawValues });
					}
					const properties = await getAssetsForScenario(scenario.id);
					const hasPrimaryResidence = properties.some(
						(a) => a.asset_type === 'property' && a.details?.propertyUse === 'primary_residence'
					);
					await handleProperty(result.data, scenario.id, userId, hasPrimaryResidence);
					break;
				}
				case 'mortgage': {
					const result = mortgageSchema.safeParse(rawValues);
					if (!result.success) {
						return fail(400, { errors: result.error.flatten().fieldErrors, values: rawValues });
					}
					await handleMortgage(result.data, scenario.id, userId);
					break;
				}
				case 'shares': {
					const result = sharesSchema.safeParse(rawValues);
					if (!result.success) {
						return fail(400, { errors: result.error.flatten().fieldErrors, values: rawValues });
					}
					const dbResult = await handleShares(result.data, scenario.id, rawValues);
					if (dbResult) return dbResult;
					break;
				}
				case 'superannuation': {
					const result = superannuationSchema.safeParse(rawValues);
					if (!result.success) {
						return fail(400, { errors: result.error.flatten().fieldErrors, values: rawValues });
					}
					const dbResult = await handleSuperannuation(result.data, scenario.id, rawValues);
					if (dbResult) return dbResult;
					break;
				}
			}
		} catch {
			return fail(500, {
				formError: 'Unable to create asset. Please check the inputs and try again.',
				values: rawValues
			});
		}

		throw redirect(303, '/dashboard');
	}
};

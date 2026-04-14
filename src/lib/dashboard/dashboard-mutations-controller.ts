import { getPayloadErrorMessage, postAction } from '$lib/dashboard/action-client';
import type {
	AccountEditDraft,
	CashflowDraft,
	CashflowSummary,
	TransferDraft,
	TransferEditDraft
} from '$lib/dashboard/types';
import {
	createAssetCashflowCommand,
	createTransferCashflowCommand,
	deleteCashflowCommand,
	saveTransferEditDraftCommand,
	updateAssetCashflowCommand,
	updateCashflowAmountCommand,
	updateTransferInflationAffectedCommand
} from '$lib/dashboard/cashflow-commands';
import {
	addReserveRuleForTargetCommand,
	addSweepRuleForSourceCommand,
	moveReserveRuleCommand,
	moveSweepRuleCommand,
	removeReserveRuleCommand,
	removeSweepRuleCommand,
	upsertFundingTargetForAccountCommand
} from '$lib/dashboard/funding-commands';
import {
	runScenarioMutationCommand,
	saveAccountEditDraftCommand
} from '$lib/dashboard/entity-commands';
import {
	removeAutoFundingRuleCommand,
	saveAutoFundingRuleCommand
} from '$lib/dashboard/planner-commands';

type WithLock = (key: string, run: () => Promise<void>, showSpinner?: boolean) => Promise<void>;

type RefreshProjection = (options?: {
	includeCashflows?: boolean;
	force?: boolean;
}) => Promise<void>;

type SetProjectionError = (message: string | null) => void;
type SetWhatIfLoadError = (message: string | null) => void;
type RefreshWhatIf = () => Promise<void>;

export type DashboardMutationControllerDeps = {
	scenarioId: string;
	getAutoRunProjection: () => boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	refreshWhatIf?: RefreshWhatIf;
	setProjectionError: SetProjectionError;
	setWhatIfLoadError?: SetWhatIfLoadError;

	getStage2AccessibilityShortfall: () => unknown;
	getPlannerSourceAccountId: () => string;
	setPlannerSourceAccountId: (value: string) => void;
	setAutoFundingRuleError: (value: string) => void;

	setFundingTabError: (value: string) => void;
	getAutoFundingRules: () => Array<Record<string, unknown>>;
	setAutoFundingRules: (rules: Array<Record<string, unknown>>) => void;
	getAutoSweepRules: () => Array<Record<string, unknown>>;
	setAutoSweepRules: (rules: Array<Record<string, unknown>>) => void;
	setAccountBalanceTargets: (targets: Array<Record<string, unknown>>) => void;
	getFundingReserveDraft: (accountId: string) => string;
	getFundingCapDraft: (accountId: string) => string;
	setReserveOrderOverride: (targetAccountId: string, orderedRuleIds: string[]) => void;

	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	getTransferDraft: () => TransferDraft;
	setTransferDraft: (draft: TransferDraft) => void;
	setTransferFormError: (message: string) => void;
	setTransferInlineError: (message: string) => void;
	getTransferEditDraft: (cashflowId: string) => TransferEditDraft;
	setTransferEditDraft: (cashflowId: string, updates: Partial<TransferEditDraft>) => void;
	getCashflowDrafts: () => Record<string, CashflowDraft>;
	setCashflowDrafts: (drafts: Record<string, CashflowDraft>) => void;
	getCashflowFormErrors: () => Record<string, string>;
	setCashflowFormErrors: (errors: Record<string, string>) => void;
	setActiveCashflowForm: (
		form: { assetId: string; type: 'income' | 'expense'; cashflowId?: string } | null
	) => void;
	getAssetType: (assetId: string) => string;
	getDefaultDraft: (
		assetId: string,
		type: 'income' | 'expense',
		assetType: string
	) => CashflowDraft;
	getDraftKey: (assetId: string, type: 'income' | 'expense') => string;
	isValidMonthYear: (value: unknown) => boolean;
	toMonthYearInput: (value: unknown) => string;

	getAccountEditDraft: (accountId: string) => AccountEditDraft;
	setAccountEditDraft: (accountId: string, updates: Partial<AccountEditDraft>) => void;
	getAccountsList: () => Array<Record<string, unknown>>;
	setAccountsList: (accounts: Array<Record<string, unknown>>) => void;
	setAccountInlineError: (message: string) => void;
	normalizeYearMonthValue: (value: unknown) => number | null;
	roundToTwo: (value: number) => number;
};

export const createDashboardMutationController = (deps: DashboardMutationControllerDeps) => {
	const saveAutoFundingRule = async () => {
		const result = await saveAutoFundingRuleCommand({
			stage2AccessibilityShortfall: deps.getStage2AccessibilityShortfall() as any,
			plannerSourceAccountId: deps.getPlannerSourceAccountId(),
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			postAction,
			setAutoFundingRules: deps.setAutoFundingRules,
			refreshProjection: deps.refreshProjection
		});
		deps.setAutoFundingRuleError(result.autoFundingRuleError);
		if (result.nextPlannerSourceAccountId !== undefined) {
			deps.setPlannerSourceAccountId(result.nextPlannerSourceAccountId);
		}
		deps.setProjectionError(result.projectionError);
	};

	const removeAutoFundingRule = async (ruleId: string) => {
		const result = await removeAutoFundingRuleCommand({
			ruleId,
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			postAction,
			setAutoFundingRules: deps.setAutoFundingRules,
			refreshProjection: deps.refreshProjection
		});
		deps.setAutoFundingRuleError(result.autoFundingRuleError);
		deps.setProjectionError(result.projectionError);
	};

	const upsertFundingTargetForAccount = async (accountId: string) => {
		deps.setFundingTabError(
			await upsertFundingTargetForAccountCommand({
				accountId,
				minDraft: deps.getFundingReserveDraft(accountId) ?? '0',
				maxDraft: deps.getFundingCapDraft(accountId) ?? '',
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				withLock: deps.withLock,
				postAction,
				setAccountBalanceTargets: deps.setAccountBalanceTargets,
				refreshProjection: deps.refreshProjection
			})
		);
	};

	const addReserveRuleForTarget = async (
		targetAccountId: string,
		selectedSourceAccountId: string
	) => {
		deps.setFundingTabError(
			await addReserveRuleForTargetCommand({
				targetAccountId,
				selectedSourceAccountId,
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				autoFundingRules: deps.getAutoFundingRules() as any,
				withLock: deps.withLock,
				postAction,
				setAutoFundingRules: deps.setAutoFundingRules,
				refreshProjection: deps.refreshProjection
			})
		);
	};

	const removeReserveRule = async (ruleId: string) => {
		deps.setFundingTabError(
			await removeReserveRuleCommand({
				ruleId,
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				autoFundingRules: deps.getAutoFundingRules() as any,
				withLock: deps.withLock,
				postAction,
				setAutoFundingRules: deps.setAutoFundingRules,
				refreshProjection: deps.refreshProjection
			})
		);
	};

	const moveReserveRule = async (targetAccountId: string, ruleId: string, direction: -1 | 1) => {
		deps.setFundingTabError(
			await moveReserveRuleCommand({
				targetAccountId,
				ruleId,
				direction,
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				autoFundingRules: deps.getAutoFundingRules() as any,
				withLock: deps.withLock,
				postAction,
				setAutoFundingRules: deps.setAutoFundingRules,
				refreshProjection: deps.refreshProjection,
				setReserveOrderOverride: deps.setReserveOrderOverride
			})
		);
	};

	const addSweepRuleForSource = async (
		sourceAccountId: string,
		selectedDestinationAccountId: string
	) => {
		deps.setFundingTabError(
			await addSweepRuleForSourceCommand({
				sourceAccountId,
				selectedDestinationAccountId,
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				autoSweepRules: deps.getAutoSweepRules() as any,
				withLock: deps.withLock,
				postAction,
				setAutoSweepRules: deps.setAutoSweepRules,
				refreshProjection: deps.refreshProjection
			})
		);
	};

	const removeSweepRule = async (ruleId: string) => {
		deps.setFundingTabError(
			await removeSweepRuleCommand({
				ruleId,
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				autoSweepRules: deps.getAutoSweepRules() as any,
				withLock: deps.withLock,
				postAction,
				setAutoSweepRules: deps.setAutoSweepRules,
				refreshProjection: deps.refreshProjection
			})
		);
	};

	const moveSweepRule = async (sourceAccountId: string, ruleId: string, direction: -1 | 1) => {
		deps.setFundingTabError(
			await moveSweepRuleCommand({
				sourceAccountId,
				ruleId,
				direction,
				scenarioId: deps.scenarioId,
				autoRunProjection: deps.getAutoRunProjection(),
				autoSweepRules: deps.getAutoSweepRules() as any,
				withLock: deps.withLock,
				postAction,
				setAutoSweepRules: deps.setAutoSweepRules,
				refreshProjection: deps.refreshProjection
			})
		);
	};

	const runScenarioMutation = async (
		lockKey: string,
		action: string,
		fields: Record<string, string>,
		errorMessage: string
	) => {
		const error = await runScenarioMutationCommand({
			lockKey,
			action,
			scenarioId: deps.scenarioId,
			fields,
			errorMessage,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			refreshWhatIf: deps.refreshWhatIf
		});
		if (error) deps.setProjectionError(error);
	};

	const updateRetirementAge = async (assetId: string, retirementAge: number) => {
		await runScenarioMutation(
			`retirement:${assetId}`,
			'updateRetirementAge',
			{
				assetId,
				retirementAge: String(retirementAge)
			},
			'Unable to update retirement age. Please try again.'
		);
	};

	const updatePersonDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		dob: string
	) => {
		await runScenarioMutation(
			`person-details:${assetId}`,
			'updatePersonDetails',
			{
				assetId,
				name,
				startDate,
				dob
			},
			'Unable to update person details. Please try again.'
		);
	};

	const updatePropertyDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		propertyUse: 'primary_residence' | 'investment_property',
		marketValue: number,
		marketGrowthRate: number,
		saleDate: string,
		fixedSellingCosts: number,
		variableSellingCosts: number
	) => {
		await runScenarioMutation(
			`property:${assetId}`,
			'updatePropertyDetails',
			{
				assetId,
				name,
				startDate,
				propertyUse,
				marketValue: String(marketValue),
				marketGrowthRate: String(marketGrowthRate),
				saleDate,
				fixedSellingCosts: String(fixedSellingCosts),
				variableSellingCosts: String(variableSellingCosts)
			},
			'Unable to update property details. Please try again.'
		);
	};

	const updateShareDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		capitalGrowthRate: number,
		dividendYield: number,
		dividendsTakenAsIncomeDate: string
	) => {
		await runScenarioMutation(
			`shares:${assetId}`,
			'updateShareDetails',
			{
				assetId,
				name,
				startDate,
				capitalGrowthRate: String(capitalGrowthRate),
				dividendYield: String(dividendYield),
				dividendsTakenAsIncomeDate
			},
			'Unable to update shares details. Please try again.'
		);
	};

	const updateAccountInterestRate = async (accountId: string, interestRate: number) => {
		await runScenarioMutation(
			`account:${accountId}`,
			'updateAccountInterestRate',
			{
				accountId,
				interestRate: String(interestRate)
			},
			'Unable to update account interest rate. Please try again.'
		);
	};

	const updateMortgageDetails = async (
		assetId: string,
		name: string,
		startDate: string,
		termYears: number,
		termMonths: number,
		mortgageAccountName: string,
		openingBalance: number
	) => {
		await runScenarioMutation(
			`mortgage:${assetId}`,
			'updateMortgageDetails',
			{
				assetId,
				name,
				startDate,
				termYears: String(termYears),
				termMonths: String(termMonths),
				mortgageAccountName,
				openingBalance: String(openingBalance)
			},
			'Unable to update mortgage details. Please try again.'
		);
	};

	const updateSuperannuationDetails = async (
		assetId: string,
		preservationAge: number,
		capitalGrowthRate: number,
		managementFeeRate: number
	) => {
		await runScenarioMutation(
			`super:${assetId}`,
			'updateSuperannuationDetails',
			{
				assetId,
				preservationAge: String(preservationAge),
				capitalGrowthRate: String(capitalGrowthRate),
				managementFeeRate: String(managementFeeRate)
			},
			'Unable to update superannuation details. Please try again.'
		);
	};

	const updateCashflowAmount = async (cashflowId: string, amount: number) => {
		const error = await updateCashflowAmountCommand({
			cashflowId,
			amount,
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection
		});
		if (error) deps.setProjectionError(error);
	};

	const createAssetCashflow = async (assetId: string, draft: CashflowDraft) => {
		const error = await createAssetCashflowCommand({
			assetId,
			draft,
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			syncCashflowAmounts: deps.syncCashflowAmounts,
			setCashflows: deps.setCashflows,
			resetDraft: () => {
				const draftKey = deps.getDraftKey(assetId, draft.type);
				const assetType = deps.getAssetType(assetId);
				deps.setCashflowDrafts({
					...deps.getCashflowDrafts(),
					[draftKey]: deps.getDefaultDraft(assetId, draft.type, assetType)
				});
			},
			clearForm: () => {
				deps.setActiveCashflowForm(null);
			},
			setFormError: (message) => {
				deps.setCashflowFormErrors({ ...deps.getCashflowFormErrors(), [assetId]: message });
			}
		});
		if (error) deps.setProjectionError(error);
	};

	const updateAssetCashflow = async (
		assetId: string,
		cashflowId: string,
		draft: CashflowDraft,
		options?: { closeFormOnSuccess?: boolean }
	) => {
		const error = await updateAssetCashflowCommand({
			assetId,
			cashflowId,
			draft,
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			syncCashflowAmounts: deps.syncCashflowAmounts,
			setCashflows: deps.setCashflows,
			clearForm: () => {
				deps.setActiveCashflowForm(null);
			},
			setFormError: (message) => {
				deps.setCashflowFormErrors({ ...deps.getCashflowFormErrors(), [assetId]: message });
			},
			closeFormOnSuccess: options?.closeFormOnSuccess
		});
		if (error) deps.setProjectionError(error);
	};

	const createTransferCashflow = async () => {
		const error = await createTransferCashflowCommand({
			draft: deps.getTransferDraft(),
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			isValidMonthYear: deps.isValidMonthYear,
			setCashflows: deps.setCashflows,
			syncCashflowAmounts: deps.syncCashflowAmounts,
			setTransferDraft: deps.setTransferDraft,
			setTransferFormError: deps.setTransferFormError
		});
		if (error) deps.setProjectionError(error);
	};

	const updateTransferInflationAffected = async (
		cashflowId: string,
		inflationAffected: boolean
	) => {
		const error = await updateTransferInflationAffectedCommand({
			cashflowId,
			inflationAffected,
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			setCashflows: deps.setCashflows,
			syncCashflowAmounts: deps.syncCashflowAmounts
		});
		if (error) deps.setProjectionError(error);
	};

	const saveTransferEditDraft = async (cashflowId: string) => {
		const error = await saveTransferEditDraftCommand({
			cashflowId,
			draft: deps.getTransferEditDraft(cashflowId),
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			isValidMonthYear: deps.isValidMonthYear,
			toMonthYearInput: deps.toMonthYearInput,
			setCashflows: deps.setCashflows,
			syncCashflowAmounts: deps.syncCashflowAmounts,
			setTransferEditDraft: deps.setTransferEditDraft,
			setTransferInlineError: deps.setTransferInlineError
		});
		if (error) deps.setProjectionError(error);
	};

	const saveAccountEditDraft = async (accountId: string) => {
		const result = await saveAccountEditDraftCommand({
			accountId,
			draft: deps.getAccountEditDraft(accountId),
			scenarioId: deps.scenarioId,
			accounts: deps.getAccountsList() as any,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			isValidMonthYear: deps.isValidMonthYear,
			normalizeYearMonthValue: deps.normalizeYearMonthValue,
			roundToTwo: deps.roundToTwo,
			toMonthYearInput: deps.toMonthYearInput,
			refreshProjection: deps.refreshProjection
		});
		if (!result.ok) {
			deps.setAccountInlineError(result.error);
			deps.setProjectionError(result.error);
			return;
		}
		deps.setAccountsList(result.accounts as any);
		deps.setAccountEditDraft(accountId, result.nextDraft);
		deps.setAccountInlineError('');
	};

	const confirmDeleteCashflow = async (cashflowId: string) => {
		const error = await deleteCashflowCommand({
			cashflowId,
			scenarioId: deps.scenarioId,
			autoRunProjection: deps.getAutoRunProjection(),
			withLock: deps.withLock,
			refreshProjection: deps.refreshProjection,
			setCashflows: deps.setCashflows,
			syncCashflowAmounts: deps.syncCashflowAmounts
		});
		if (error) deps.setProjectionError(error);
	};

	const confirmDeleteAsset = async (assetId: string) => {
		try {
			await deps.withLock(
				`deleteAsset:${assetId}`,
				async () => {
					const formData = new FormData();
					formData.set('scenarioId', deps.scenarioId);
					formData.set('assetId', assetId);
					const response = await fetch('/dashboard/data/delete-asset', {
						method: 'POST',
						body: formData,
						headers: { accept: 'application/json' }
					});
					const payload = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(
							getPayloadErrorMessage(payload, 'Unable to delete asset. Please try again.')
						);
					}
					deps.setWhatIfLoadError?.(null);
					if (deps.refreshWhatIf) {
						await deps.refreshWhatIf();
					}
					await deps.refreshProjection();
				},
				deps.getAutoRunProjection()
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unable to delete asset. Please try again.';
			deps.setWhatIfLoadError?.(message);
		}
	};

	return {
		saveAutoFundingRule,
		removeAutoFundingRule,
		upsertFundingTargetForAccount,
		addReserveRuleForTarget,
		removeReserveRule,
		moveReserveRule,
		addSweepRuleForSource,
		removeSweepRule,
		moveSweepRule,
		updateRetirementAge,
		updatePersonDetails,
		updatePropertyDetails,
		updateShareDetails,
		updateAccountInterestRate,
		updateMortgageDetails,
		updateSuperannuationDetails,
		updateCashflowAmount,
		createAssetCashflow,
		updateAssetCashflow,
		createTransferCashflow,
		updateTransferInflationAffected,
		saveTransferEditDraft,
		saveAccountEditDraft,
		confirmDeleteCashflow,
		confirmDeleteAsset
	};
};

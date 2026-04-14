import { writable } from 'svelte/store';
import type { AccountEditDraft, CashflowDraft, TransferDraft, TransferEditDraft } from './types';

export type DashboardLoadState = {
	isInitialProjectionLoading: boolean;
	isInitialWhatIfLoading: boolean;
	projectionError: string | null;
	whatIfLoadError: string | null;
};

export const createDashboardLoadStateStore = () => {
	const { subscribe, update } = writable<DashboardLoadState>({
		isInitialProjectionLoading: true,
		isInitialWhatIfLoading: true,
		projectionError: null,
		whatIfLoadError: null
	});

	return {
		subscribe,
		apply(updater: (state: DashboardLoadState) => DashboardLoadState) {
			update(updater);
		},
		setProjectionError(message: string | null) {
			update((state) => ({ ...state, projectionError: message }));
		},
		setWhatIfLoadError(message: string | null) {
			update((state) => ({ ...state, whatIfLoadError: message }));
		}
	};
};

export const createDashboardProjectionStateStore = <
	ProjectionData,
	SessionRates,
	ProjectionRange extends string
>(initialState: {
	projectionData: ProjectionData;
	sessionRates: SessionRates;
	projectionRange: ProjectionRange;
	projectionVersion?: number;
}) => {
	const { subscribe, update } = writable({
		projectionData: initialState.projectionData,
		sessionRates: initialState.sessionRates,
		projectionRange: initialState.projectionRange,
		projectionVersion: initialState.projectionVersion ?? 1
	});

	return {
		subscribe,
		setProjectionData(projectionData: ProjectionData) {
			update((state) => ({
				...state,
				projectionData,
				projectionVersion: state.projectionVersion + 1
			}));
		},
		setSessionRates(sessionRates: SessionRates) {
			update((state) => ({ ...state, sessionRates }));
		},
		setProjectionRange(projectionRange: ProjectionRange) {
			update((state) => ({ ...state, projectionRange }));
		},
		applyProjectionPayload(payload: {
			projectionData: ProjectionData;
			sessionRates: SessionRates;
			projectionRange: ProjectionRange;
		}) {
			update((state) => ({
				...state,
				projectionData: payload.projectionData,
				sessionRates: payload.sessionRates,
				projectionRange: payload.projectionRange,
				projectionVersion: state.projectionVersion + 1
			}));
		}
	};
};

export const createDashboardWhatIfStateStore = <
	AssetItem,
	AccountItem,
	AssetAccountItem,
	CashflowItem,
	AutoFundingRuleItem,
	AccountBalanceTargetItem,
	AutoSweepRuleItem
>(initialState: {
	assetsList: AssetItem[];
	accountsList: AccountItem[];
	assetAccountsList: AssetAccountItem[];
	cashflows: CashflowItem[];
	autoFundingRules: AutoFundingRuleItem[];
	accountBalanceTargets: AccountBalanceTargetItem[];
	autoSweepRules: AutoSweepRuleItem[];
}) => {
	const createBaseState = () => ({
		assetsList: initialState.assetsList,
		accountsList: initialState.accountsList,
		assetAccountsList: initialState.assetAccountsList,
		cashflows: initialState.cashflows,
		autoFundingRules: initialState.autoFundingRules,
		accountBalanceTargets: initialState.accountBalanceTargets,
		autoSweepRules: initialState.autoSweepRules
	});

	const { subscribe, update, set } = writable(createBaseState());

	return {
		subscribe,
		resetData() {
			set({
				...createBaseState(),
				assetsList: [],
				accountsList: [],
				assetAccountsList: [],
				cashflows: [],
				autoFundingRules: [],
				accountBalanceTargets: [],
				autoSweepRules: []
			});
		},
		applyWhatIfPayload(payload: {
			assetsList?: AssetItem[];
			accountsList?: AccountItem[];
			assetAccountsList?: AssetAccountItem[];
			cashflows?: CashflowItem[];
			autoFundingRules?: AutoFundingRuleItem[];
			accountBalanceTargets?: AccountBalanceTargetItem[];
			autoSweepRules?: AutoSweepRuleItem[];
		}) {
			update((state) => ({
				...state,
				assetsList: payload.assetsList ?? state.assetsList,
				accountsList: payload.accountsList ?? state.accountsList,
				assetAccountsList: payload.assetAccountsList ?? state.assetAccountsList,
				cashflows: payload.cashflows ?? state.cashflows,
				autoFundingRules: payload.autoFundingRules ?? state.autoFundingRules,
				accountBalanceTargets: payload.accountBalanceTargets ?? state.accountBalanceTargets,
				autoSweepRules: payload.autoSweepRules ?? state.autoSweepRules
			}));
		},
		setAccountsList(accountsList: AccountItem[]) {
			update((state) => ({ ...state, accountsList }));
		},
		setCashflows(cashflows: CashflowItem[]) {
			update((state) => ({ ...state, cashflows }));
		},
		setAutoFundingRules(autoFundingRules: AutoFundingRuleItem[]) {
			update((state) => ({ ...state, autoFundingRules }));
		},
		setAccountBalanceTargets(accountBalanceTargets: AccountBalanceTargetItem[]) {
			update((state) => ({ ...state, accountBalanceTargets }));
		},
		setAutoSweepRules(autoSweepRules: AutoSweepRuleItem[]) {
			update((state) => ({ ...state, autoSweepRules }));
		}
	};
};

export type DashboardUiState = {
	cashflowFormErrors: Record<string, string>;
	activeCashflowForm: { assetId: string; type: 'income' | 'expense'; cashflowId?: string } | null;
	cashflowDrafts: Record<string, CashflowDraft>;
	expandedPersonDetailIds: Set<string>;
	expandedPropertyDetailIds: Set<string>;
	expandedMortgageDetailIds: Set<string>;
	expandedShareDetailIds: Set<string>;
	transferFormError: string;
	transferInlineError: string;
	transferDraft: TransferDraft;
	transferEditDrafts: Record<string, TransferEditDraft>;
	accountEditDrafts: Record<string, AccountEditDraft>;
	accountInlineError: string;
};

const createDefaultDashboardUiState = (): DashboardUiState => ({
	cashflowFormErrors: {},
	activeCashflowForm: null,
	cashflowDrafts: {},
	expandedPersonDetailIds: new Set(),
	expandedPropertyDetailIds: new Set(),
	expandedMortgageDetailIds: new Set(),
	expandedShareDetailIds: new Set(),
	transferFormError: '',
	transferInlineError: '',
	transferDraft: createEmptyTransferDraft(),
	transferEditDrafts: {},
	accountEditDrafts: {},
	accountInlineError: ''
});

export const createDashboardUiStateStore = () => {
	const { subscribe, set, update } = writable<DashboardUiState>(createDefaultDashboardUiState());

	return {
		subscribe,
		reset() {
			set(createDefaultDashboardUiState());
		},
		apply(updater: (state: DashboardUiState) => DashboardUiState) {
			update(updater);
		},
		setActiveCashflowForm(activeCashflowForm: DashboardUiState['activeCashflowForm']) {
			update((state) => ({ ...state, activeCashflowForm }));
		},
		setCashflowDrafts(cashflowDrafts: DashboardUiState['cashflowDrafts']) {
			update((state) => ({ ...state, cashflowDrafts }));
		},
		setCashflowFormErrors(cashflowFormErrors: DashboardUiState['cashflowFormErrors']) {
			update((state) => ({ ...state, cashflowFormErrors }));
		},
		setExpandedPersonDetailIds(expandedPersonDetailIds: Set<string>) {
			update((state) => ({ ...state, expandedPersonDetailIds }));
		},
		setExpandedPropertyDetailIds(expandedPropertyDetailIds: Set<string>) {
			update((state) => ({ ...state, expandedPropertyDetailIds }));
		},
		setExpandedMortgageDetailIds(expandedMortgageDetailIds: Set<string>) {
			update((state) => ({ ...state, expandedMortgageDetailIds }));
		},
		setExpandedShareDetailIds(expandedShareDetailIds: Set<string>) {
			update((state) => ({ ...state, expandedShareDetailIds }));
		},
		setTransferDraft(transferDraft: TransferDraft) {
			update((state) => ({ ...state, transferDraft }));
		},
		setTransferEditDrafts(transferEditDrafts: DashboardUiState['transferEditDrafts']) {
			update((state) => ({ ...state, transferEditDrafts }));
		},
		setTransferFormError(transferFormError: string) {
			update((state) => ({ ...state, transferFormError }));
		},
		setTransferInlineError(transferInlineError: string) {
			update((state) => ({ ...state, transferInlineError }));
		},
		setAccountEditDrafts(accountEditDrafts: DashboardUiState['accountEditDrafts']) {
			update((state) => ({ ...state, accountEditDrafts }));
		},
		setAccountInlineError(accountInlineError: string) {
			update((state) => ({ ...state, accountInlineError }));
		}
	};
};

export const createEmptyTransferDraft = (): TransferDraft => ({
	sourceAccountId: '',
	destinationAccountId: '',
	amount: '',
	frequency: 'monthly',
	startDate: '',
	endDate: '',
	description: '',
	inflationAffected: false
});

export type DashboardScenarioResetState = {
	personRetirementAges: Record<string, number>;
	personDetails: Record<string, { name: string; startDate: string; dob: string }>;
	cashflowAmounts: Record<string, number>;
	propertyDetails: Record<string, unknown>;
	shareDetails: Record<string, unknown>;
	superDetails: Record<string, unknown>;
	accountInterestRates: Record<string, number>;
	propertyErrors: Record<string, unknown>;
	shareErrors: Record<string, unknown>;
	mortgageDetails: Record<string, unknown>;
	mortgageErrors: Record<string, unknown>;
	personDetailsErrors: Record<string, { name?: string; startDate?: string; dob?: string }>;
	cashflowFormErrors: Record<string, string>;
	activeCashflowForm: { assetId: string; type: 'income' | 'expense'; cashflowId?: string } | null;
	cashflowDrafts: Record<string, CashflowDraft>;
	updateTimers: Record<string, ReturnType<typeof setTimeout>>;
	editingCashflowIds: Set<string>;
	expandedPersonDetailIds: Set<string>;
	expandedPropertyDetailIds: Set<string>;
	expandedMortgageDetailIds: Set<string>;
	expandedShareDetailIds: Set<string>;
	transferFormError: string;
	transferInlineError: string;
	accountInlineError: string;
	plannerLiquidityShortcutError: string;
	plannerAdvancedOpenStage: 'stage3' | 'stage4';
	fundingReserveDrafts: Record<string, string>;
	fundingCapDrafts: Record<string, string>;
	fundingTabError: string;
	transferDraft: TransferDraft;
	transferEditDrafts: Record<string, TransferEditDraft>;
	accountEditDrafts: Record<string, AccountEditDraft>;
};

export const createDashboardScenarioResetState = (): DashboardScenarioResetState => ({
	personRetirementAges: {},
	personDetails: {},
	cashflowAmounts: {},
	propertyDetails: {},
	shareDetails: {},
	superDetails: {},
	accountInterestRates: {},
	propertyErrors: {},
	shareErrors: {},
	mortgageDetails: {},
	mortgageErrors: {},
	personDetailsErrors: {},
	cashflowFormErrors: {},
	activeCashflowForm: null,
	cashflowDrafts: {},
	updateTimers: {},
	editingCashflowIds: new Set(),
	expandedPersonDetailIds: new Set(),
	expandedPropertyDetailIds: new Set(),
	expandedMortgageDetailIds: new Set(),
	expandedShareDetailIds: new Set(),
	transferFormError: '',
	transferInlineError: '',
	accountInlineError: '',
	plannerLiquidityShortcutError: '',
	plannerAdvancedOpenStage: 'stage3',
	fundingReserveDrafts: {},
	fundingCapDrafts: {},
	fundingTabError: '',
	transferDraft: createEmptyTransferDraft(),
	transferEditDrafts: {},
	accountEditDrafts: {}
});

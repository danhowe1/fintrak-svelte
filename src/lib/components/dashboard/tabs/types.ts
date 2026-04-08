import type {
	AccountEditDraft,
	AccountListItem,
	AccountOption,
	AssetAccountLink,
	AssetListItem,
	AutoFundingRule,
	AutoSweepRule,
	CashflowDraft,
	CashflowFormState,
	CashflowSummary,
	LabelOption,
	MortgageDetail,
	MortgageErrors,
	MonthFrequency,
	PersonDetail,
	PersonDetailErrors,
	PropertyDetail,
	PropertyErrors,
	ShareDetail,
	ShareErrors,
	SuperDetail,
	TransferDraft,
	TransferEditDraft
} from '$lib/dashboard/types';

export type {
	AccountEditDraft,
	AccountListItem,
	AccountOption,
	AssetAccountLink,
	AssetListItem,
	AutoFundingRule,
	AutoSweepRule,
	CashflowDraft,
	CashflowFormState,
	CashflowSummary,
	LabelOption,
	MortgageDetail,
	MortgageErrors,
	MonthFrequency,
	PersonDetail,
	PersonDetailErrors,
	PropertyDetail,
	PropertyErrors,
	ShareDetail,
	ShareErrors,
	SuperDetail,
	TransferDraft,
	TransferEditDraft
};

export type AssetsTabDataProps = {
	assetsList: AssetListItem[];
	assetAccountsList: AssetAccountLink[];
	accountsList: AccountListItem[];
};

export type AssetsTabPersonProps = {
	personDetails: Record<string, PersonDetail>;
	personRetirementAges: Record<string, number>;
	setPersonRetirementAge: (assetId: string, value: number) => void;
	updateRetirementAge: (assetId: string, retirementAge: number) => Promise<void>;
	expandedPersonDetailIds: Set<string>;
	togglePersonDetails: (id: string) => void;
	personDetailsErrors: Record<string, PersonDetailErrors>;
	isValidMonthYear: (value: string) => boolean;
	setPersonDetails: (assetId: string, details: PersonDetail) => void;
	setPersonDetailsError: (
		assetId: string,
		field: keyof PersonDetailErrors,
		message: string
	) => void;
	updatePersonDetails: (
		assetId: string,
		name: string,
		startDate: string,
		dob: string
	) => Promise<void>;
};

export type AssetsTabCashflowProps = {
	cashflowsByAssetId: Record<string, CashflowSummary[]>;
	cashflowAmounts: Record<string, number>;
	editingCashflowIds: Set<string>;
	setCashflowAmount: (cashflowId: string, value: number) => void;
	updateCashflowAmount: (cashflowId: string, value: number) => Promise<void>;
	openCashflowFormForEdit: (assetId: string, cashflow: CashflowSummary) => void;
	requestDeleteCashflow: (cashflowId: string) => void;
	openCashflowForm: (assetId: string, type: 'income' | 'expense') => void;
	activeCashflowForm: CashflowFormState;
	getDraftKey: (assetId: string, type: 'income' | 'expense', cashflowId?: string) => string;
	cashflowDrafts: Record<string, CashflowDraft>;
	getCategoryOptionsFor: (assetId: string, type: 'income' | 'expense') => LabelOption[];
	cashflowFrequencyOptions: LabelOption[];
	getAssetAccountOptions: (assetId: string) => AccountOption[];
	cashflowFormErrors: Record<string, string>;
	setCashflowDraft: (key: string, updates: Partial<CashflowDraft>) => void;
	closeCashflowForm: () => void;
	updateAssetCashflow: (assetId: string, cashflowId: string, draft: CashflowDraft) => Promise<void>;
	createAssetCashflow: (assetId: string, draft: CashflowDraft) => Promise<void>;
};

export type AssetsTabShareProps = {
	shareDetails: Record<string, ShareDetail>;
	shareErrors: Record<string, ShareErrors>;
	expandedShareDetailIds: Set<string>;
	toggleShareDetails: (id: string) => void;
	setShareDetails: (assetId: string, details: ShareDetail) => void;
	setShareError: (assetId: string, field: keyof ShareErrors, message: string) => void;
	updateShareDetails: (
		assetId: string,
		name: string,
		startDate: string,
		capitalGrowthRate: number,
		dividendYield: number,
		dividendsTakenAsIncomeDate: string
	) => Promise<void>;
};

export type AssetsTabSuperProps = {
	superDetails: Record<string, SuperDetail>;
	setSuperDetails: (assetId: string, details: SuperDetail) => void;
	updateSuperannuationDetails: (
		assetId: string,
		preservationAge: number,
		capitalGrowthRate: number,
		managementFeeRate: number
	) => Promise<void>;
};

export type AssetsTabPropertyProps = {
	propertyDetails: Record<string, PropertyDetail>;
	propertyErrors: Record<string, PropertyErrors>;
	expandedPropertyDetailIds: Set<string>;
	togglePropertyDetails: (id: string) => void;
	setPropertyDetails: (assetId: string, details: PropertyDetail) => void;
	setPropertyError: (assetId: string, field: keyof PropertyErrors, message: string) => void;
	updatePropertyDetails: (
		assetId: string,
		name: string,
		startDate: string,
		marketValue: number,
		marketGrowthRate: number,
		saleDate: string,
		fixedSellingCosts: number,
		variableSellingCosts: number
	) => Promise<void>;
};

export type AssetsTabMortgageProps = {
	mortgageDetails: Record<string, MortgageDetail>;
	mortgageErrors: Record<string, MortgageErrors>;
	expandedMortgageDetailIds: Set<string>;
	toggleMortgageDetails: (id: string) => void;
	setMortgageDetails: (assetId: string, details: MortgageDetail) => void;
	setMortgageError: (assetId: string, field: keyof MortgageErrors, message: string) => void;
	updateMortgageDetails: (
		assetId: string,
		name: string,
		startDate: string,
		termYears: number,
		termMonths: number,
		mortgageAccountName: string,
		openingBalance: number
	) => Promise<void>;
	validateMortgageDetails: (assetId: string, details: MortgageDetail) => boolean;
};

export type AssetsTabUiProps = {
	stepForValue: (value: number) => number;
	scheduleUpdate: (key: string, handler: () => void) => void;
	formatLabel: (value: string) => string;
	toMonthYearInput: (value: unknown) => string;
	roundToTwo: (value: number) => number;
	formatRate: (value: number, decimals: number) => string;
	formatYearMonthInput: (value: unknown) => string;
};

export type AssetsTabProps = {
	data: AssetsTabDataProps;
	person: AssetsTabPersonProps;
	cashflow: AssetsTabCashflowProps;
	share: AssetsTabShareProps;
	super: AssetsTabSuperProps;
	property: AssetsTabPropertyProps;
	mortgage: AssetsTabMortgageProps;
	ui: AssetsTabUiProps;
};

export type AccountsTabDataProps = {
	accountsList: AccountListItem[];
	accountEditDrafts: Record<string, AccountEditDraft>;
	accountInterestRates: Record<string, number>;
	accountInlineError: string;
};

export type AccountsTabActionsProps = {
	setAccountEditDraft: (accountId: string, updates: Partial<AccountEditDraft>) => void;
	saveAccountEditDraft: (accountId: string) => Promise<void>;
	setAccountInterestRate: (accountId: string, value: number) => void;
	adjustAccountInterestRate: (accountId: string, delta: number) => void;
	updateAccountInterestRate: (accountId: string, value: number) => Promise<void>;
};

export type AccountsTabUiProps = {
	toMonthYearInput: (value: unknown) => string;
	scheduleUpdate: (key: string, handler: () => void) => void;
	formatRate: (value: number, decimals: number) => string;
	roundToTwo: (value: number) => number;
	formatLabel: (value: string) => string;
};

export type AccountsTabProps = {
	data: AccountsTabDataProps;
	actions: AccountsTabActionsProps;
	ui: AccountsTabUiProps;
};

export type TransfersTabDataProps = {
	transferCashflows: CashflowSummary[];
	transferEditDrafts: Record<string, TransferEditDraft>;
	transferAccountOptions: AccountOption[];
	transferInlineError: string;
	transferFormError: string;
	transferDraft: TransferDraft;
};

export type TransfersTabHandlersProps = {
	onTransferDraftChange: (updates: Partial<TransferDraft>) => void;
	setTransferEditDraft: (cashflowId: string, updates: Partial<TransferEditDraft>) => void;
	saveTransferEditDraft: (cashflowId: string) => Promise<void>;
	onTransferInflationToggle: (transferId: string, checked: boolean) => void;
	requestDeleteCashflow: (cashflowId: string) => void;
	createTransferCashflow: () => Promise<void>;
};

export type TransfersTabUiProps = {
	formatLabel: (value: string) => string;
	cashflowFrequencyOptions: LabelOption[];
	toMonthYearInput: (value: unknown) => string;
	scheduleUpdate: (key: string, handler: () => void) => void;
};

export type TransfersTabProps = {
	data: TransfersTabDataProps;
	handlers: TransfersTabHandlersProps;
	ui: TransfersTabUiProps;
};

export type ReservesTabDataProps = {
	fundingCashAccountOptions: AccountOption[];
	fundingReserveDrafts: Record<string, string>;
	fundingReservePriorityRowCount: number;
	fundingReserveRulesByAccount: Record<string, AutoFundingRule[]>;
	fundingReserveSourceOptionsByAccount: Record<string, AccountOption[]>;
	transferAccountOptions: AccountOption[];
	fundingTabError: string;
};

export type ReservesTabActionsProps = {
	setFundingReserveDraft: (accountId: string, value: string) => void;
	upsertFundingTargetForAccount: (accountId: string) => Promise<void>;
	moveReserveRule: (targetAccountId: string, ruleId: string, direction: -1 | 1) => Promise<void>;
	removeReserveRule: (ruleId: string) => Promise<void>;
	addReserveRuleForTarget: (
		targetAccountId: string,
		selectedSourceAccountId: string
	) => Promise<void>;
};

export type ReservesTabUiProps = {
	scheduleUpdate: (key: string, handler: () => void) => void;
};

export type ReservesTabProps = {
	data: ReservesTabDataProps;
	actions: ReservesTabActionsProps;
	ui: ReservesTabUiProps;
};

export type CapsTabDataProps = {
	fundingCashAccountOptions: AccountOption[];
	fundingCapDrafts: Record<string, string>;
	fundingCapPriorityRowCount: number;
	fundingSweepRulesByAccount: Record<string, AutoSweepRule[]>;
	fundingSweepDestinationOptionsByAccount: Record<string, AccountOption[]>;
	transferAccountOptions: AccountOption[];
	fundingTabError: string;
};

export type CapsTabActionsProps = {
	setFundingCapDraft: (accountId: string, value: string) => void;
	upsertFundingTargetForAccount: (accountId: string) => Promise<void>;
	moveSweepRule: (sourceAccountId: string, ruleId: string, direction: -1 | 1) => Promise<void>;
	removeSweepRule: (ruleId: string) => Promise<void>;
	addSweepRuleForSource: (
		sourceAccountId: string,
		selectedDestinationAccountId: string
	) => Promise<void>;
};

export type CapsTabUiProps = {
	scheduleUpdate: (key: string, handler: () => void) => void;
};

export type CapsTabProps = {
	data: CapsTabDataProps;
	actions: CapsTabActionsProps;
	ui: CapsTabUiProps;
};

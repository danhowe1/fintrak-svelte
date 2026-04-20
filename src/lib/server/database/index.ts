// shared infrastructure
export { getPool } from './shared';
export type { PropertyUse } from './shared';

// users
export { getAuthenticatedUser, resolveAuthenticatedUserId } from './users';

// scenarios
export type { ScenarioSummary, ScenarioRecord, ScenarioListItem } from './scenarios';
export {
	countScenariosForUser,
	getSingleScenarioForUser,
	getScenarioForUserById,
	getScenariosForUser,
	deleteScenarioForOwner,
	renameScenarioForOwner
} from './scenarios';

// assets
export type {
	AssetListItem,
	CreateAssetInput,
	CreatePersonAssetWithCashflowsInput,
	CreatePropertyAssetWithExpenseInput,
	CreateMortgageAssetWithAccountsInput,
	CreateShareAssetWithBrokerageInput,
	CreateSuperannuationAssetWithAccountInput
} from './assets';
export {
	getAssetsForScenario,
	createAsset,
	updatePersonRetirementAge,
	updatePersonDetails,
	updatePropertyDetails,
	updateShareDetails,
	updateMortgageDetails,
	updateSuperannuationDetails
} from './assets';

// accounts
export type { AccountListItem, CreateAccountInput } from './accounts';
export {
	getAccountsForScenario,
	createAccount,
	createAccountWithHolders,
	updateAccountInterestRate,
	updateAccountDetails
} from './accounts';

// cashflows
export type { CashflowSummary } from './cashflows';
export {
	createCashflow,
	updateCashflow,
	deleteCashflow,
	updateCashflowAmount,
	updateCashflowInflationAffected
} from './cashflows';

// funding rules
export type {
	AssetAccountLink,
	AutoFundingRule,
	AccountBalanceTarget,
	AutoSweepRule
} from './funding-rules';
export {
	getOrCreateHeldInAssetAccount,
	upsertAccountBalanceTarget,
	deleteAccountBalanceTarget,
	createAutoFundingRule,
	createAutoSweepRule,
	deleteAutoFundingRule,
	deleteAutoSweepRule,
	reorderAutoFundingRules,
	reorderAutoSweepRules
} from './funding-rules';

// projection bundles and large composite operations
export type {
	ProjectionScenarioInputs,
	ProjectionScenarioBundle,
	ProjectionScenarioListBundle,
	CreateScenarioWithPersonInput
} from './projection-bundle';
export {
	getProjectionBundleForUser,
	getProjectionBundlesForUser,
	deleteAssetForScenario,
	createScenarioWithPerson,
	cloneScenarioForUser,
	createPersonAssetWithCashflows,
	createPropertyAssetWithExpense,
	createMortgageAssetWithAccounts,
	createShareAssetWithBrokerage,
	createSuperannuationAssetWithAccount
} from './projection-bundle';

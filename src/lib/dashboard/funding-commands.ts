import { getThrownErrorMessage, type ActionPayload } from '$lib/dashboard/action-client';
import { applySweepPriorityOrder, reorderRuleIds } from '$lib/dashboard/funding-order';

type WithLock = (
	key: string,
	callback: () => Promise<void>,
	requiresAutoRun?: boolean
) => Promise<void>;

type PostAction = (
	actionName: string,
	formData: FormData,
	fallbackErrorMessage: string
) => Promise<ActionPayload>;

type RefreshProjection = (options: { includeCashflows: boolean; force: boolean }) => Promise<void>;

type AccountBalanceTargetLike = {
	account_id: string;
	enabled: boolean;
	min_balance: number;
	max_balance: number | null;
};

type ReserveRuleLike = {
	id: string;
	scenario_id: string;
	source_account_id: string;
	target_account_id: string;
	priority_order: number;
	enabled: boolean;
	min_target_balance: number;
	created_at: string;
	updated_at: string;
};

type SweepRuleLike = {
	id: string;
	scenario_id: string;
	source_account_id: string;
	destination_account_id: string;
	priority_order: number;
	enabled: boolean;
	created_at: string;
	updated_at: string;
};

export const upsertFundingTargetForAccountCommand = async <TTarget>(params: {
	accountId: string;
	minDraft: string;
	maxDraft: string;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	postAction: PostAction;
	setAccountBalanceTargets: (targets: TTarget[]) => void;
	refreshProjection: RefreshProjection;
}): Promise<string> => {
	const { accountId, minDraft, maxDraft, scenarioId, autoRunProjection, withLock, postAction } = params;
	const minBalance = Number(minDraft ?? '0');
	const maxRaw = (maxDraft ?? '').trim();
	const maxBalance = maxRaw.length > 0 ? Number(maxRaw) : null;

	if (!Number.isFinite(minBalance) || minBalance < 0) {
		return 'Reserve must be a number greater than or equal to 0.';
	}
	if (maxBalance !== null && (!Number.isFinite(maxBalance) || maxBalance < 0)) {
		return 'Cap must be blank or a number greater than or equal to 0.';
	}
	if (maxBalance !== null && maxBalance < minBalance) {
		return 'Cap must be greater than or equal to reserve.';
	}

	try {
		await withLock(
			`funding-target-save:${accountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('accountId', accountId);
				formData.set('minBalance', String(minBalance));
				formData.set('maxBalance', maxRaw);
				const payload = await postAction(
					'updateAccountBalanceTarget',
					formData,
					'Unable to save reserve/cap.'
				);
				if (Array.isArray(payload?.accountBalanceTargets)) {
					params.setAccountBalanceTargets(payload.accountBalanceTargets as TTarget[]);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		);
		return '';
	} catch (error) {
		return error instanceof Error ? error.message : 'Unable to save reserve/cap.';
	}
};

export const addReserveRuleForTargetCommand = async <TRule extends ReserveRuleLike>(params: {
	targetAccountId: string;
	selectedSourceAccountId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	autoFundingRules: TRule[];
	withLock: WithLock;
	postAction: PostAction;
	setAutoFundingRules: (rules: TRule[]) => void;
	refreshProjection: RefreshProjection;
}): Promise<string> => {
	const { targetAccountId, selectedSourceAccountId, scenarioId, autoRunProjection } = params;
	if (!selectedSourceAccountId) {
		return 'Select a reserve funding source account.';
	}
	try {
		await params.withLock(
			`funding-reserve-add:${targetAccountId}`,
			async () => {
				const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
				const currentRules = params.autoFundingRules
					.filter((rule) => rule.target_account_id === targetAccountId)
					.sort((a, b) => a.priority_order - b.priority_order);
				params.setAutoFundingRules([
					...params.autoFundingRules,
					{
						id: optimisticId,
						scenario_id: scenarioId,
						source_account_id: selectedSourceAccountId,
						target_account_id: targetAccountId,
						priority_order: currentRules.length + 1,
						enabled: true,
						min_target_balance: 0,
						created_at: '',
						updated_at: ''
					} as TRule
				]);
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('targetAccountId', targetAccountId);
				formData.set('sourceAccountId', selectedSourceAccountId);
				const payload = await params.postAction(
					'upsertAutoFundingRule',
					formData,
					'Unable to add reserve funding rule.'
				);
				if (Array.isArray(payload?.autoFundingRules)) {
					params.setAutoFundingRules(payload.autoFundingRules as TRule[]);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		);
		return '';
	} catch (error) {
		return getThrownErrorMessage(error, 'Unable to add reserve funding rule.');
	}
};

export const removeReserveRuleCommand = async <TRule extends { id: string }>(params: {
	ruleId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	autoFundingRules: TRule[];
	withLock: WithLock;
	postAction: PostAction;
	setAutoFundingRules: (rules: TRule[]) => void;
	refreshProjection: RefreshProjection;
}): Promise<string> => {
	const { ruleId, scenarioId, autoRunProjection, autoFundingRules } = params;
	const previousRules = [...autoFundingRules];
	params.setAutoFundingRules(autoFundingRules.filter((rule) => rule.id !== ruleId));
	try {
		await params.withLock(
			`funding-reserve-delete:${ruleId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('ruleId', ruleId);
				const payload = await params.postAction(
					'deleteAutoFundingRule',
					formData,
					'Unable to delete reserve funding rule.'
				);
				if (Array.isArray(payload?.autoFundingRules)) {
					params.setAutoFundingRules(payload.autoFundingRules as TRule[]);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		);
		return '';
	} catch (error) {
		params.setAutoFundingRules(previousRules);
		return getThrownErrorMessage(error, 'Unable to delete reserve funding rule.');
	}
};

export const moveReserveRuleCommand = async <
	TRule extends { id: string; target_account_id: string; priority_order: number }
>(params: {
	targetAccountId: string;
	ruleId: string;
	direction: -1 | 1;
	scenarioId: string;
	autoRunProjection: boolean;
	autoFundingRules: TRule[];
	withLock: WithLock;
	postAction: PostAction;
	setAutoFundingRules: (rules: TRule[]) => void;
	refreshProjection: RefreshProjection;
	setReserveOrderOverride: (targetAccountId: string, orderedRuleIds: string[]) => void;
}): Promise<string> => {
	const rules = params.autoFundingRules
		.filter((rule) => rule.target_account_id === params.targetAccountId)
		.sort((a, b) => a.priority_order - b.priority_order);
	const reorderedIds = reorderRuleIds(rules, params.ruleId, params.direction);
	if (!reorderedIds) return '';

	try {
		await params.withLock(
			`funding-reserve-move:${params.targetAccountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('targetAccountId', params.targetAccountId);
				formData.set('ruleIds', reorderedIds.join(','));
				const payload = await params.postAction(
					'reorderAutoFundingRules',
					formData,
					'Unable to reorder reserve funding rules.'
				);
				params.setReserveOrderOverride(params.targetAccountId, reorderedIds);
				if (Array.isArray(payload?.autoFundingRules)) {
					params.setAutoFundingRules(payload.autoFundingRules as TRule[]);
				} else {
					params.setAutoFundingRules(
						params.autoFundingRules.map((rule) => {
							if (rule.target_account_id !== params.targetAccountId) return rule;
							const nextIndex = reorderedIds.indexOf(rule.id);
							return nextIndex < 0 ? rule : { ...rule, priority_order: nextIndex + 1 };
						})
					);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			params.autoRunProjection
		);
		return '';
	} catch (error) {
		return getThrownErrorMessage(error, 'Unable to reorder reserve funding rules.');
	}
};

export const addSweepRuleForSourceCommand = async <TRule extends SweepRuleLike>(params: {
	sourceAccountId: string;
	selectedDestinationAccountId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	autoSweepRules: TRule[];
	withLock: WithLock;
	postAction: PostAction;
	setAutoSweepRules: (rules: TRule[]) => void;
	refreshProjection: RefreshProjection;
}): Promise<string> => {
	const { sourceAccountId, selectedDestinationAccountId, scenarioId } = params;
	if (!selectedDestinationAccountId) {
		return 'Select an auto-sweep destination account.';
	}
	try {
		await params.withLock(
			`funding-sweep-add:${sourceAccountId}`,
			async () => {
				const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
				const currentRules = params.autoSweepRules
					.filter((rule) => rule.source_account_id === sourceAccountId)
					.sort((a, b) => a.priority_order - b.priority_order);
				params.setAutoSweepRules([
					...params.autoSweepRules,
					{
						id: optimisticId,
						scenario_id: scenarioId,
						source_account_id: sourceAccountId,
						destination_account_id: selectedDestinationAccountId,
						priority_order: currentRules.length + 1,
						enabled: true,
						created_at: '',
						updated_at: ''
					} as TRule
				]);
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('sourceAccountId', sourceAccountId);
				formData.set('destinationAccountId', selectedDestinationAccountId);
				const payload = await params.postAction(
					'upsertAutoSweepRule',
					formData,
					'Unable to add auto-sweep rule.'
				);
				if (Array.isArray(payload?.autoSweepRules)) {
					params.setAutoSweepRules(payload.autoSweepRules as TRule[]);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			params.autoRunProjection
		);
		return '';
	} catch (error) {
		return error instanceof Error ? error.message : 'Unable to add auto-sweep rule.';
	}
};

export const removeSweepRuleCommand = async <TRule extends { id: string }>(params: {
	ruleId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	autoSweepRules: TRule[];
	withLock: WithLock;
	postAction: PostAction;
	setAutoSweepRules: (rules: TRule[]) => void;
	refreshProjection: RefreshProjection;
}): Promise<string> => {
	const previousRules = [...params.autoSweepRules];
	params.setAutoSweepRules(params.autoSweepRules.filter((rule) => rule.id !== params.ruleId));
	try {
		await params.withLock(
			`funding-sweep-delete:${params.ruleId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('ruleId', params.ruleId);
				const payload = await params.postAction(
					'deleteAutoSweepRule',
					formData,
					'Unable to delete auto-sweep rule.'
				);
				if (Array.isArray(payload?.autoSweepRules)) {
					params.setAutoSweepRules(payload.autoSweepRules as TRule[]);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			params.autoRunProjection
		);
		return '';
	} catch (error) {
		params.setAutoSweepRules(previousRules);
		return error instanceof Error ? error.message : 'Unable to delete auto-sweep rule.';
	}
};

export const moveSweepRuleCommand = async <
	TRule extends { id: string; source_account_id: string; priority_order: number }
>(params: {
	sourceAccountId: string;
	ruleId: string;
	direction: -1 | 1;
	scenarioId: string;
	autoRunProjection: boolean;
	autoSweepRules: TRule[];
	withLock: WithLock;
	postAction: PostAction;
	setAutoSweepRules: (rules: TRule[]) => void;
	refreshProjection: RefreshProjection;
}): Promise<string> => {
	const rules = params.autoSweepRules
		.filter((rule) => rule.source_account_id === params.sourceAccountId)
		.sort((a, b) => a.priority_order - b.priority_order);
	const reorderedIds = reorderRuleIds(rules, params.ruleId, params.direction);
	if (!reorderedIds) return '';

	params.setAutoSweepRules(
		applySweepPriorityOrder(params.autoSweepRules, params.sourceAccountId, reorderedIds)
	);
	try {
		await params.withLock(
			`funding-sweep-move:${params.sourceAccountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('sourceAccountId', params.sourceAccountId);
				formData.set('ruleIds', reorderedIds.join(','));
				const payload = await params.postAction(
					'reorderAutoSweepRules',
					formData,
					'Unable to reorder auto-sweep rules.'
				);
				if (Array.isArray(payload?.autoSweepRules)) {
					params.setAutoSweepRules(payload.autoSweepRules as TRule[]);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			params.autoRunProjection
		);
		return '';
	} catch (error) {
		return error instanceof Error ? error.message : 'Unable to reorder auto-sweep rules.';
	}
};


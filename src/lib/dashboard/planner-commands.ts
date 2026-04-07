import type { ActionPayload } from '$lib/dashboard/action-client';

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

type Stage2AllocationShortfallLike = {
	targetAccountId: string;
};

export type SaveAutoFundingRuleParams = {
	stage2AllocationShortfall: Stage2AllocationShortfallLike | null;
	plannerSourceAccountId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	postAction: PostAction;
	setAutoFundingRules: (rules: any[]) => void;
	refreshProjection: (options: { includeCashflows: boolean; force: boolean }) => Promise<void>;
};

export type PlannerAutoFundingResult = {
	autoFundingRuleError: string;
	projectionError: string | null;
	nextPlannerSourceAccountId?: string;
};

export const saveAutoFundingRuleCommand = async <TRule>(
	params: Omit<SaveAutoFundingRuleParams, 'setAutoFundingRules'> & {
		setAutoFundingRules: (rules: TRule[]) => void;
	}
): Promise<PlannerAutoFundingResult> => {
	const {
		stage2AllocationShortfall,
		plannerSourceAccountId,
		scenarioId,
		autoRunProjection,
		withLock,
		postAction,
		setAutoFundingRules,
		refreshProjection
	} = params;
	if (!stage2AllocationShortfall) {
		return { autoFundingRuleError: '', projectionError: null };
	}
	if (!plannerSourceAccountId) {
		return { autoFundingRuleError: 'Select a source account.', projectionError: null };
	}

	try {
		await withLock(
			`auto-funding-save:${stage2AllocationShortfall.targetAccountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('targetAccountId', stage2AllocationShortfall.targetAccountId);
				formData.set('sourceAccountId', plannerSourceAccountId);
				const payload = await postAction(
					'upsertAutoFundingRule',
					formData,
					'Unable to save auto-funding rule.'
				);
				if (Array.isArray(payload?.autoFundingRules)) {
					setAutoFundingRules(payload.autoFundingRules as TRule[]);
				}
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		);
		return {
			autoFundingRuleError: '',
			projectionError: null,
			nextPlannerSourceAccountId: ''
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unable to save auto-funding rule.';
		return {
			autoFundingRuleError: message,
			projectionError: message
		};
	}
};

export type RemoveAutoFundingRuleParams = {
	ruleId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	postAction: PostAction;
	setAutoFundingRules: (rules: any[]) => void;
	refreshProjection: (options: { includeCashflows: boolean; force: boolean }) => Promise<void>;
};

export const removeAutoFundingRuleCommand = async <TRule>(
	params: Omit<RemoveAutoFundingRuleParams, 'setAutoFundingRules'> & {
		setAutoFundingRules: (rules: TRule[]) => void;
	}
): Promise<PlannerAutoFundingResult> => {
	const {
		ruleId,
		scenarioId,
		autoRunProjection,
		withLock,
		postAction,
		setAutoFundingRules,
		refreshProjection
	} = params;
	try {
		await withLock(
			`auto-funding-delete:${ruleId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('ruleId', ruleId);
				const payload = await postAction(
					'deleteAutoFundingRule',
					formData,
					'Unable to remove auto-funding rule.'
				);
				if (Array.isArray(payload?.autoFundingRules)) {
					setAutoFundingRules(payload.autoFundingRules as TRule[]);
				}
				await refreshProjection({ includeCashflows: true, force: true });
			},
			autoRunProjection
		);
		return { autoFundingRuleError: '', projectionError: null };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unable to remove auto-funding rule.';
		return {
			autoFundingRuleError: message,
			projectionError: message
		};
	}
};

export const jumpToWhatIfFundingInput = async (params: {
	tab: 'reserves' | 'caps';
	firstCashAccountId: string;
	setAssetPanelTab: (tab: 'reserves' | 'caps') => void;
	tick: () => Promise<void>;
	whatIfPanelElement: HTMLElement | null;
	getElementById: (id: string) => HTMLElement | null;
}) => {
	const { tab, firstCashAccountId, setAssetPanelTab, tick, whatIfPanelElement, getElementById } = params;
	setAssetPanelTab(tab);
	await tick();
	whatIfPanelElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	if (!firstCashAccountId) return;
	const inputId =
		tab === 'reserves'
			? `reserve-amount-input-${firstCashAccountId}`
			: `cap-amount-input-${firstCashAccountId}`;
	const targetInput = getElementById(inputId) as HTMLInputElement | null;
	targetInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	targetInput?.focus({ preventScroll: true });
	try {
		targetInput?.select();
	} catch {
		// Number inputs may not support text selection across browsers.
	}
};

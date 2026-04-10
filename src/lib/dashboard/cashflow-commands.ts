import type {
	CashflowDraft,
	CashflowSummary,
	TransferDraft,
	TransferEditDraft
} from '$lib/dashboard/types';
import {
	validateNewTransferDraft,
	validateTransferEditDraft
} from '$lib/dashboard/transfer-validation';

type WithLock = (
	key: string,
	callback: () => Promise<void>,
	requiresAutoRun?: boolean
) => Promise<void>;

type RefreshProjection = (options?: {
	includeCashflows?: boolean;
	force?: boolean;
}) => Promise<void>;

const parseCashflowsPayload = (payload: any): CashflowSummary[] | null => {
	const nextCashflows = payload?.cashflows ?? payload?.data?.cashflows;
	return Array.isArray(nextCashflows) ? (nextCashflows as CashflowSummary[]) : null;
};

const postJsonAction = async (action: string, formData: FormData, fallbackError: string) => {
	const response = await fetch(`?/${action}`, {
		method: 'POST',
		body: formData,
		headers: { accept: 'application/json' }
	});
	if (!response.ok) {
		throw new Error(fallbackError);
	}
	return response.json();
};

export const updateCashflowAmountCommand = async (params: {
	cashflowId: string;
	amount: number;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
}): Promise<string | null> => {
	try {
		await params.withLock(
			`cashflow:${params.cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('cashflowId', params.cashflowId);
				formData.set('amount', String(params.amount));
				const response = await fetch('?/updateCashflowAmount', { method: 'POST', body: formData });
				if (!response.ok) {
					throw new Error('Unable to update cashflow amount. Please try again.');
				}
				await params.refreshProjection();
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Unable to update cashflow amount.';
	}
};

export const createAssetCashflowCommand = async (params: {
	assetId: string;
	draft: CashflowDraft;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	resetDraft: () => void;
	clearForm: () => void;
	setFormError: (message: string) => void;
}): Promise<string | null> => {
	try {
		await params.withLock(
			`createCashflow:${params.assetId}`,
			async () => {
				let hasCashflows = false;
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('assetId', params.assetId);
				formData.set('type', params.draft.type);
				formData.set('category', params.draft.category);
				formData.set('frequency', params.draft.frequency);
				formData.set('amount', params.draft.amount);
				formData.set('description', params.draft.description);
				formData.set('startDate', params.draft.startDate);
				formData.set('endDate', params.draft.endDate);
				if (params.draft.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				formData.set('assetAccountId', params.draft.assetAccountId);

				const response = await fetch('?/createCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					throw new Error('Unable to create cashflow. Please check the form.');
				}
				try {
					const payload = await response.json();
					const nextCashflows = parseCashflowsPayload(payload);
					if (nextCashflows) {
						params.setCashflows(nextCashflows);
						params.syncCashflowAmounts(nextCashflows);
						hasCashflows = true;
					}
				} catch {
					// Ignore JSON parse issues; refreshProjection will sync state.
				}
				await params.refreshProjection({ includeCashflows: !hasCashflows });
				params.resetDraft();
				params.setFormError('');
				params.clearForm();
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to create cashflow.';
		params.setFormError(message);
		return message;
	}
};

export const updateAssetCashflowCommand = async (params: {
	assetId: string;
	cashflowId: string;
	draft: CashflowDraft;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	clearForm: () => void;
	setFormError: (message: string) => void;
	closeFormOnSuccess?: boolean;
}): Promise<string | null> => {
	try {
		await params.withLock(
			`updateCashflow:${params.cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('assetId', params.assetId);
				formData.set('cashflowId', params.cashflowId);
				formData.set('type', params.draft.type);
				formData.set('category', params.draft.category);
				formData.set('frequency', params.draft.frequency);
				formData.set('amount', params.draft.amount);
				formData.set('description', params.draft.description);
				formData.set('startDate', params.draft.startDate);
				formData.set('endDate', params.draft.endDate);
				if (params.draft.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				formData.set('assetAccountId', params.draft.assetAccountId);
				const payload = await postJsonAction(
					'updateCashflow',
					formData,
					'Unable to update cashflow. Please try again.'
				);
				const nextCashflows = parseCashflowsPayload(payload);
				if (nextCashflows) {
					params.setCashflows(nextCashflows);
					params.syncCashflowAmounts(nextCashflows);
				} else {
					await params.refreshProjection({ includeCashflows: true });
				}
				params.setFormError('');
				if (params.closeFormOnSuccess ?? true) {
					params.clearForm();
				}
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to update cashflow.';
		params.setFormError(message);
		return message;
	}
};

export const createTransferCashflowCommand = async (params: {
	draft: TransferDraft;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	isValidMonthYear: (value: string) => boolean;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
	setTransferDraft: (draft: TransferDraft) => void;
	setTransferFormError: (message: string) => void;
}): Promise<string | null> => {
	const validation = validateNewTransferDraft(params.draft, params.isValidMonthYear);
	if (!validation.ok) {
		params.setTransferFormError(validation.message);
		return validation.message;
	}
	const amountValue = validation.amount;
	try {
		await params.withLock(
			'createTransferCashflow',
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('sourceAccountId', params.draft.sourceAccountId);
				formData.set('destinationAccountId', params.draft.destinationAccountId);
				formData.set('amount', String(amountValue));
				formData.set('frequency', params.draft.frequency);
				formData.set('startDate', params.draft.startDate);
				formData.set('endDate', params.draft.endDate);
				formData.set('description', params.draft.description.trim());
				if (params.draft.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				const response = await fetch('?/createTransferCashflow', {
					method: 'POST',
					body: formData,
					headers: { accept: 'application/json' }
				});
				if (!response.ok) {
					let message = 'Unable to create transfer. Please check the form.';
					try {
						const payload = await response.json();
						message = payload?.error ?? payload?.data?.error ?? payload?.message ?? message;
					} catch {
						// Ignore parse errors.
					}
					throw new Error(message);
				}
				const payload = await response.json();
				const nextCashflows = parseCashflowsPayload(payload);
				if (nextCashflows) {
					params.setCashflows(nextCashflows);
					params.syncCashflowAmounts(nextCashflows);
				} else {
					await params.refreshProjection({ includeCashflows: true });
				}
				params.setTransferFormError('');
				params.setTransferDraft({
					...params.draft,
					amount: '',
					description: '',
					endDate: ''
				});
				await params.refreshProjection();
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to create transfer.';
		params.setTransferFormError(message);
		return message;
	}
};

export const updateTransferInflationAffectedCommand = async (params: {
	cashflowId: string;
	inflationAffected: boolean;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
}): Promise<string | null> => {
	try {
		await params.withLock(
			`transfer-inflation:${params.cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('cashflowId', params.cashflowId);
				if (params.inflationAffected) {
					formData.set('inflationAffected', 'on');
				}
				const payload = await postJsonAction(
					'updateTransferInflationAffected',
					formData,
					'Unable to update transfer inflation setting.'
				);
				const nextCashflows = parseCashflowsPayload(payload);
				if (nextCashflows) {
					params.setCashflows(nextCashflows);
					params.syncCashflowAmounts(nextCashflows);
				}
				await params.refreshProjection({ includeCashflows: true, force: true });
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Unable to update transfer inflation setting.';
	}
};

export const saveTransferEditDraftCommand = async (params: {
	cashflowId: string;
	draft: TransferEditDraft | undefined;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	isValidMonthYear: (value: string) => boolean;
	toMonthYearInput: (value: unknown) => string;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
	setTransferEditDraft: (cashflowId: string, updates: Partial<TransferEditDraft>) => void;
	setTransferInlineError: (message: string) => void;
}): Promise<string | null> => {
	const draft = params.draft;
	if (!draft) return null;
	const validation = validateTransferEditDraft(draft, params.isValidMonthYear);
	if (!validation.ok) {
		params.setTransferInlineError(validation.message);
		return validation.message;
	}
	const amountValue = validation.amount;
	try {
		await params.withLock(
			`transfer-edit:${params.cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('cashflowId', params.cashflowId);
				formData.set('sourceAccountId', draft.sourceAccountId);
				formData.set('destinationAccountId', draft.destinationAccountId);
				formData.set('amount', String(amountValue));
				formData.set('frequency', draft.frequency);
				formData.set('startDate', draft.startDate);
				formData.set('endDate', draft.frequency === 'one_time' ? '' : draft.endDate);
				formData.set('description', draft.description.trim());
				const payload = await postJsonAction(
					'updateTransferCashflow',
					formData,
					'Unable to update transfer.'
				);
				const nextCashflows = parseCashflowsPayload(payload);
				if (nextCashflows) {
					params.setCashflows(nextCashflows);
					params.syncCashflowAmounts(nextCashflows);
					const refreshedTransfer = nextCashflows.find((item) => item.id === params.cashflowId);
					if (refreshedTransfer) {
						params.setTransferEditDraft(params.cashflowId, {
							sourceAccountId: refreshedTransfer.source_account_id ?? '',
							destinationAccountId: refreshedTransfer.destination_account_id ?? '',
							amount: String(refreshedTransfer.amount ?? ''),
							frequency: refreshedTransfer.frequency,
							startDate: params.toMonthYearInput(refreshedTransfer.start_date),
							endDate: refreshedTransfer.end_date
								? params.toMonthYearInput(refreshedTransfer.end_date)
								: '',
							description: refreshedTransfer.description ?? ''
						});
					}
				}
				params.setTransferInlineError('');
				await params.refreshProjection({ includeCashflows: true });
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to update transfer.';
		params.setTransferInlineError(message);
		return message;
	}
};

export const deleteCashflowCommand = async (params: {
	cashflowId: string;
	scenarioId: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	setCashflows: (cashflows: CashflowSummary[]) => void;
	syncCashflowAmounts: (cashflows: CashflowSummary[]) => void;
}): Promise<string | null> => {
	try {
		await params.withLock(
			`deleteCashflow:${params.cashflowId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', params.scenarioId);
				formData.set('cashflowId', params.cashflowId);
				const payload = await postJsonAction(
					'deleteCashflow',
					formData,
					'Unable to delete cashflow. Please try again.'
				);
				const nextCashflows = parseCashflowsPayload(payload);
				if (nextCashflows) {
					params.setCashflows(nextCashflows);
					params.syncCashflowAmounts(nextCashflows);
				} else {
					await params.refreshProjection({ includeCashflows: true });
				}
			},
			params.autoRunProjection
		);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : 'Unable to delete cashflow.';
	}
};

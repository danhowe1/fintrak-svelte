import type { AccountEditDraft } from '$lib/dashboard/types';

type WithLock = (
	key: string,
	callback: () => Promise<void>,
	requiresAutoRun?: boolean
) => Promise<void>;

type RefreshProjection = (options?: {
	includeCashflows?: boolean;
	force?: boolean;
}) => Promise<void>;
type RefreshWhatIf = () => Promise<void>;

const postFormAction = async (
	action: string,
	formData: FormData,
	errorMessage: string,
	headers?: Record<string, string>
) => {
	const response = await fetch(`?/${action}`, {
		method: 'POST',
		body: formData,
		headers
	});
	if (!response.ok) throw new Error(errorMessage);
};

export const runScenarioMutationCommand = async (params: {
	lockKey: string;
	action: string;
	scenarioId: string;
	fields: Record<string, string>;
	errorMessage: string;
	autoRunProjection: boolean;
	withLock: WithLock;
	refreshProjection: RefreshProjection;
	refreshWhatIf?: RefreshWhatIf;
	headers?: Record<string, string>;
}): Promise<string | null> => {
	const {
		lockKey,
		action,
		scenarioId,
		fields,
		errorMessage,
		autoRunProjection,
		withLock,
		refreshProjection,
		refreshWhatIf,
		headers
	} = params;
	try {
		await withLock(
			lockKey,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				for (const [key, value] of Object.entries(fields)) {
					formData.set(key, value);
				}
				await postFormAction(action, formData, errorMessage, headers);
				if (refreshWhatIf) {
					await refreshWhatIf();
				}
				await refreshProjection();
			},
			autoRunProjection
		);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : errorMessage;
	}
};

export type SaveAccountEditDraftResult<TAccount> =
	| { ok: false; error: string }
	| {
			ok: true;
			accounts: TAccount[];
			nextDraft: { name: string; startDate: string; openingBalance: string };
	  };

export const saveAccountEditDraftCommand = async <
	TAccount extends { id: string; name: string; start_date: number; opening_balance: number }
>(params: {
	accountId: string;
	draft: AccountEditDraft | undefined;
	scenarioId: string;
	accounts: TAccount[];
	autoRunProjection: boolean;
	withLock: WithLock;
	isValidMonthYear: (value: string) => boolean;
	normalizeYearMonthValue: (value: unknown) => number | null;
	roundToTwo: (value: number) => number;
	toMonthYearInput: (value: number) => string;
	refreshProjection: RefreshProjection;
}): Promise<SaveAccountEditDraftResult<TAccount>> => {
	const {
		accountId,
		draft,
		scenarioId,
		accounts,
		autoRunProjection,
		withLock,
		isValidMonthYear,
		normalizeYearMonthValue,
		roundToTwo,
		toMonthYearInput,
		refreshProjection
	} = params;

	if (!draft) return { ok: false, error: 'Unable to update account details.' };
	const name = draft.name.trim();
	const openingBalance = Number(draft.openingBalance);
	const normalizedStartDate = normalizeYearMonthValue(draft.startDate);

	if (!name) return { ok: false, error: 'Account name is required.' };
	if (!isValidMonthYear(draft.startDate) || normalizedStartDate === null) {
		return { ok: false, error: 'Account start date must use MM YYYY.' };
	}
	if (!Number.isFinite(openingBalance)) {
		return { ok: false, error: 'Opening balance must be a valid number.' };
	}

	try {
		await withLock(
			`account-edit:${accountId}`,
			async () => {
				const formData = new FormData();
				formData.set('scenarioId', scenarioId);
				formData.set('accountId', accountId);
				formData.set('name', name);
				formData.set('startDate', draft.startDate);
				formData.set('openingBalance', String(openingBalance));
				await postFormAction(
					'updateAccountDetails',
					formData,
					'Unable to update account details.',
					{ accept: 'application/json' }
				);
				await refreshProjection();
			},
			autoRunProjection
		);
		const roundedOpeningBalance = roundToTwo(openingBalance);
		const nextAccounts = accounts.map((account) =>
			account.id === accountId
				? {
						...account,
						name,
						start_date: normalizedStartDate,
						opening_balance: roundedOpeningBalance
					}
				: account
		);
		return {
			ok: true,
			accounts: nextAccounts,
			nextDraft: {
				name,
				startDate: toMonthYearInput(normalizedStartDate),
				openingBalance: String(roundedOpeningBalance)
			}
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : 'Unable to update account details.'
		};
	}
};

import type { TransferDraft, TransferEditDraft } from './types';

type ValidationResult = { ok: true; amount: number } | { ok: false; message: string };

const parsePositiveAmount = (value: string): number | null => {
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	return amount;
};

export const validateNewTransferDraft = (
	draft: TransferDraft,
	isValidMonthYear: (value: string) => boolean
): ValidationResult => {
	if (
		!draft.sourceAccountId ||
		!draft.destinationAccountId ||
		draft.sourceAccountId === draft.destinationAccountId ||
		!draft.amount.trim() ||
		!isValidMonthYear(draft.startDate) ||
		(draft.endDate.trim().length > 0 && !isValidMonthYear(draft.endDate))
	) {
		return {
			ok: false,
			message:
				'Choose different source and destination accounts, use a valid amount, and use MM YYYY dates.'
		};
	}
	const amount = parsePositiveAmount(draft.amount);
	if (amount === null) {
		return { ok: false, message: 'Amount must be greater than 0.' };
	}
	return { ok: true, amount };
};

export const validateTransferEditDraft = (
	draft: TransferEditDraft,
	isValidMonthYear: (value: string) => boolean
): ValidationResult => {
	if (
		!draft.sourceAccountId ||
		!draft.destinationAccountId ||
		draft.sourceAccountId === draft.destinationAccountId
	) {
		return { ok: false, message: 'Choose different source and destination accounts.' };
	}
	const amount = parsePositiveAmount(draft.amount);
	if (amount === null) {
		return { ok: false, message: 'Transfer amount must be greater than 0.' };
	}
	if (!isValidMonthYear(draft.startDate)) {
		return { ok: false, message: 'Transfer start date must use MM YYYY.' };
	}
	if (draft.frequency !== 'one_time' && draft.endDate.trim() && !isValidMonthYear(draft.endDate)) {
		return { ok: false, message: 'Transfer end date must use MM YYYY.' };
	}
	return { ok: true, amount };
};

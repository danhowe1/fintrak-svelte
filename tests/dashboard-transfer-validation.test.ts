import { describe, expect, it } from 'vitest';
import {
	validateNewTransferDraft,
	validateTransferEditDraft
} from '../src/lib/dashboard/transfer-validation';

const isValidMonthYear = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());

describe('dashboard transfer validation', () => {
	it('validates new transfer draft', () => {
		const valid = validateNewTransferDraft(
			{
				sourceAccountId: 'a',
				destinationAccountId: 'b',
				amount: '250',
				frequency: 'monthly',
				startDate: '01 2030',
				endDate: '',
				description: '',
				inflationAffected: false
			},
			isValidMonthYear
		);
		expect(valid).toEqual({ ok: true, amount: 250 });

		const invalid = validateNewTransferDraft(
			{
				sourceAccountId: 'a',
				destinationAccountId: 'a',
				amount: '0',
				frequency: 'monthly',
				startDate: '01 2030',
				endDate: '',
				description: '',
				inflationAffected: false
			},
			isValidMonthYear
		);
		expect(invalid.ok).toBe(false);
	});

	it('validates transfer edit draft', () => {
		const valid = validateTransferEditDraft(
			{
				sourceAccountId: 'a',
				destinationAccountId: 'b',
				amount: '100',
				frequency: 'one_time',
				startDate: '03 2032',
				endDate: '',
				description: ''
			},
			isValidMonthYear
		);
		expect(valid).toEqual({ ok: true, amount: 100 });

		const invalidDate = validateTransferEditDraft(
			{
				sourceAccountId: 'a',
				destinationAccountId: 'b',
				amount: '100',
				frequency: 'monthly',
				startDate: '03 2032',
				endDate: '2032-03',
				description: ''
			},
			isValidMonthYear
		);
		expect(invalidDate).toEqual({ ok: false, message: 'Transfer end date must use MM YYYY.' });
	});
});

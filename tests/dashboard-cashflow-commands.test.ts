import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createAssetCashflowCommand,
	createTransferCashflowCommand,
	deleteCashflowCommand,
	saveTransferEditDraftCommand,
	updateCashflowAmountCommand,
	updateTransferInflationAffectedCommand
} from '../src/lib/dashboard/cashflow-commands';

describe('dashboard cashflow commands', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('validates transfer draft before posting', async () => {
		const setTransferFormError = vi.fn();
		const error = await createTransferCashflowCommand({
			draft: {
				sourceAccountId: 'a1',
				destinationAccountId: 'a1',
				amount: '0',
				frequency: 'monthly',
				startDate: '01 2030',
				endDate: '',
				description: '',
				inflationAffected: false
			},
			scenarioId: 'sc',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection: vi.fn(async () => {}),
			isValidMonthYear: () => true,
			setCashflows: vi.fn(),
			syncCashflowAmounts: vi.fn(),
			setTransferDraft: vi.fn(),
			setTransferFormError
		});
		expect(error).toContain('Choose different source and destination');
		expect(setTransferFormError).toHaveBeenCalled();
	});

	it('creates asset cashflow and clears form state', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ cashflows: [{ id: 'c1', frequency: 'monthly' }] })
			}))
		);
		const setCashflows = vi.fn();
		const setFormError = vi.fn();
		const error = await createAssetCashflowCommand({
			assetId: 'asset-1',
			draft: {
				type: 'income',
				category: 'employment_income',
				frequency: 'monthly',
				amount: '100',
				description: 'Salary',
				startDate: '01 2030',
				endDate: '',
				inflationAffected: false,
				assetAccountId: 'aa1'
			},
			scenarioId: 'sc',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection: vi.fn(async () => {}),
			syncCashflowAmounts: vi.fn(),
			setCashflows,
			resetDraft: vi.fn(),
			clearForm: vi.fn(),
			setFormError
		});
		expect(error).toBeNull();
		expect(setCashflows).toHaveBeenCalled();
		expect(setFormError).toHaveBeenLastCalledWith('');
	});

	it('saves transfer edit and updates inline draft from returned cashflow', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					cashflows: [
						{
							id: 't1',
							source_account_id: 'a',
							destination_account_id: 'b',
							amount: 55,
							frequency: 'monthly',
							start_date: 203001,
							end_date: 203012,
							description: 'x'
						}
					]
				})
			}))
		);
		const setTransferEditDraft = vi.fn();
		const setTransferInlineError = vi.fn();
		const error = await saveTransferEditDraftCommand({
			cashflowId: 't1',
			draft: {
				sourceAccountId: 'a',
				destinationAccountId: 'b',
				amount: '55',
				frequency: 'monthly',
				startDate: '01 2030',
				endDate: '12 2030',
				description: 'x'
			},
			scenarioId: 'sc',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection: vi.fn(async () => {}),
			isValidMonthYear: () => true,
			toMonthYearInput: (value) => `M${value}`,
			setCashflows: vi.fn(),
			syncCashflowAmounts: vi.fn(),
			setTransferEditDraft,
			setTransferInlineError
		});
		expect(error).toBeNull();
		expect(setTransferEditDraft).toHaveBeenCalled();
		expect(setTransferInlineError).toHaveBeenLastCalledWith('');
	});

	it('updates amount and deletes cashflow', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url.includes('deleteCashflow')) {
					return {
						ok: true,
						json: async () => ({ cashflows: [{ id: 'x' }] })
					} as any;
				}
				return { ok: true } as any;
			})
		);
		const updateErr = await updateCashflowAmountCommand({
			cashflowId: 'x',
			amount: 1,
			scenarioId: 'sc',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection: vi.fn(async () => {})
		});
		expect(updateErr).toBeNull();

		const deleteErr = await deleteCashflowCommand({
			cashflowId: 'x',
			scenarioId: 'sc',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection: vi.fn(async () => {}),
			setCashflows: vi.fn(),
			syncCashflowAmounts: vi.fn()
		});
		expect(deleteErr).toBeNull();
	});

	it('refreshes projection without a force override when toggling transfer inflation', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ cashflows: [{ id: 't1' }] })
			}))
		);
		const refreshProjection = vi.fn(async () => {});
		const error = await updateTransferInflationAffectedCommand({
			cashflowId: 't1',
			inflationAffected: true,
			scenarioId: 'sc',
			autoRunProjection: false,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection,
			setCashflows: vi.fn(),
			syncCashflowAmounts: vi.fn()
		});
		expect(error).toBeNull();
		expect(refreshProjection).toHaveBeenCalledWith({ includeCashflows: true });
	});
});

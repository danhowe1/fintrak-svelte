import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	runScenarioMutationCommand,
	saveAccountEditDraftCommand
} from '../src/lib/dashboard/entity-commands';

describe('dashboard entity commands', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('runs scenario mutation command and refreshes projection', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true }))
		);
		const refreshProjection = vi.fn(async () => {});
		const error = await runScenarioMutationCommand({
			lockKey: 'person:p1',
			action: 'updatePersonDetails',
			scenarioId: 'sc-1',
			fields: { assetId: 'p1', name: 'Pat', startDate: '01 2030', dob: '01 1990' },
			errorMessage: 'Unable',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection
		});
		expect(error).toBeNull();
		expect(refreshProjection).toHaveBeenCalled();
	});

	it('returns mutation error message when fetch fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false }))
		);
		const error = await runScenarioMutationCommand({
			lockKey: 'x',
			action: 'updateX',
			scenarioId: 'sc-1',
			fields: {},
			errorMessage: 'Unable to update',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			refreshProjection: vi.fn(async () => {})
		});
		expect(error).toBe('Unable to update');
	});

	it('validates account draft fields', async () => {
		const result = await saveAccountEditDraftCommand({
			accountId: 'a1',
			draft: {
				name: '',
				startDate: '01 2030',
				openingBalance: '123'
			},
			scenarioId: 'sc-1',
			accounts: [],
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			isValidMonthYear: () => true,
			normalizeYearMonthValue: () => 203001,
			roundToTwo: (value) => Math.round(value * 100) / 100,
			toMonthYearInput: (value) => String(value),
			refreshProjection: vi.fn(async () => {})
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('Account name is required.');
		}
	});

	it('saves account draft and returns updated account and draft', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true }))
		);
		const refreshProjection = vi.fn(async () => {});
		const result = await saveAccountEditDraftCommand({
			accountId: 'a1',
			draft: {
				name: ' Everyday ',
				startDate: '01 2030',
				openingBalance: '100.129'
			},
			scenarioId: 'sc-1',
			accounts: [
				{ id: 'a1', name: 'Old', start_date: 202901, opening_balance: 10 },
				{ id: 'a2', name: 'Other', start_date: 202901, opening_balance: 5 }
			],
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			isValidMonthYear: () => true,
			normalizeYearMonthValue: () => 203001,
			roundToTwo: (value) => Math.round(value * 100) / 100,
			toMonthYearInput: (value) => `M${value}`,
			refreshProjection
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.accounts[0].name).toBe('Everyday');
			expect(result.accounts[0].opening_balance).toBe(100.13);
			expect(result.nextDraft.startDate).toBe('M203001');
		}
		expect(refreshProjection).toHaveBeenCalled();
	});
});

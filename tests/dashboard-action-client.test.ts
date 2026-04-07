import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getThrownErrorMessage,
	postAction,
	unwrapActionPayload
} from '../src/lib/dashboard/action-client';

describe('dashboard action client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('unwraps data payloads from form actions', () => {
		expect(unwrapActionPayload({ data: { success: true } })).toEqual({ success: true });
		expect(unwrapActionPayload({ success: true })).toEqual({ success: true });
	});

	it('posts an action and returns normalized payload', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: { autoSweepRules: [] } }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const payload = await postAction(
			'upsertAutoSweepRule',
			new FormData(),
			'Unable to add auto-sweep rule.'
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('?/upsertAutoSweepRule', {
			method: 'POST',
			body: expect.any(FormData),
			headers: { accept: 'application/json' }
		});
		expect(payload).toEqual({ autoSweepRules: [] });
	});

	it('throws payload error messages for failed responses', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: { error: 'Scenario not found.' } }), {
				status: 404,
				headers: { 'content-type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			postAction('deleteAutoSweepRule', new FormData(), 'Unable to delete auto-sweep rule.')
		).rejects.toThrow('Scenario not found.');
	});

	it('normalizes unknown thrown errors to fallback text', () => {
		expect(getThrownErrorMessage(new Error('Boom'), 'Fallback')).toBe('Boom');
		expect(getThrownErrorMessage({ value: 'From value' }, 'Fallback')).toBe('From value');
		expect(getThrownErrorMessage(123, 'Fallback')).toBe('Fallback');
	});
});

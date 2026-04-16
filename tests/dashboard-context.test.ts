import { describe, expect, it, vi } from 'vitest';

import { parseProjectionRange, syncCurrentScenarioCookie } from '../src/lib/server/dashboard-context';

describe('dashboard context helper', () => {
	it('normalizes projection range values', () => {
		expect(parseProjectionRange('1y')).toBe('1y');
		expect(parseProjectionRange('bad-value')).toBe('all');
		expect(parseProjectionRange(undefined)).toBe('all');
	});

	it('syncs current scenario cookie when changed', () => {
		const cookies = {
			get: vi.fn().mockReturnValue('old-id'),
			set: vi.fn()
		};
		const event = { cookies };
		syncCurrentScenarioCookie(event as never, 'new-id');
		expect(cookies.set).toHaveBeenCalledWith(
			'currentScenarioId',
			'new-id',
			expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
		);
	});
});

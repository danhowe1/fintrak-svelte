import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getScenarioForUserById: vi.fn(),
	getSingleScenarioForUser: vi.fn()
}));

vi.mock('$lib/server/database', () => ({
	getScenarioForUserById: mocks.getScenarioForUserById,
	getSingleScenarioForUser: mocks.getSingleScenarioForUser
}));

import {
	parseProjectionRange,
	resolveDashboardScenario,
	syncCurrentScenarioCookie
} from '../src/lib/server/dashboard-context';

describe('dashboard context helper', () => {
	it('normalizes projection range values', () => {
		expect(parseProjectionRange('1y')).toBe('1y');
		expect(parseProjectionRange('bad-value')).toBe('all');
		expect(parseProjectionRange(undefined)).toBe('all');
	});

	it('resolves scenario from query or cookie', async () => {
		mocks.getScenarioForUserById.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Scenario A'
		});

		const event = {
			locals: { appUserId: '00000000-0000-0000-0000-000000000001' },
			url: new URL('http://localhost/dashboard?scenarioId=11111111-1111-1111-1111-111111111111'),
			cookies: { get: vi.fn(), set: vi.fn() }
		};

		const result = await resolveDashboardScenario(event as never);
		expect(result.scenario?.id).toBe('11111111-1111-1111-1111-111111111111');
		expect(mocks.getScenarioForUserById).toHaveBeenCalled();
	});

	it('throws login redirect when user id is missing', async () => {
		const event = {
			locals: { appUserId: null },
			url: new URL('http://localhost/dashboard?tab=overview'),
			cookies: { get: vi.fn(), set: vi.fn() }
		};

		await expect(resolveDashboardScenario(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/login?callbackUrl=%2Fdashboard%3Ftab%3Doverview'
		});
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

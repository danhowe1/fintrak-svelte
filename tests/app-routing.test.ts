import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getSingleScenarioForUser: vi.fn()
}));

vi.mock('$lib/server/database', () => ({
	getSingleScenarioForUser: mocks.getSingleScenarioForUser
}));

import { load as appLoad } from '../src/routes/(protected)/app/+page.server';

describe('app scenario routing', () => {
	it('redirects to the dashboard when the user has exactly one scenario', async () => {
		mocks.getSingleScenarioForUser.mockResolvedValue({
			id: '11111111-1111-1111-1111-111111111111'
		});
		const event = {
			parent: vi.fn().mockResolvedValue({ scenarioCount: 1 }),
			locals: {
				appUserId: '00000000-0000-0000-0000-000000000001'
			},
			cookies: {
				set: vi.fn()
			},
			url: new URL('http://localhost/app')
		};

		await expect(appLoad(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/dashboard'
		});
	});

	it('redirects to the scenario list when the user has multiple scenarios', async () => {
		const event = {
			parent: vi.fn().mockResolvedValue({ scenarioCount: 2 })
		};

		await expect(appLoad(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/scenarios'
		});
	});
});

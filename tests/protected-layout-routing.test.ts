import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	countScenariosForUser: vi.fn(),
	getAuthenticatedUserId: vi.fn()
}));

vi.mock('$lib/server/database', () => ({
	countScenariosForUser: mocks.countScenariosForUser,
	getAuthenticatedUserId: mocks.getAuthenticatedUserId
}));

import { load as protectedLayoutLoad } from '../src/routes/(protected)/+layout.server';

describe('protected layout routing', () => {
	it('redirects unauthenticated users to login', async () => {
		const event = {
			locals: {
				auth: vi.fn().mockResolvedValue(null)
			},
			url: new URL('http://localhost/dashboard?tab=overview')
		};

		await expect(protectedLayoutLoad(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/login?callbackUrl=%2Fdashboard%3Ftab%3Doverview'
		});
	});

	it('redirects users with no scenarios to scenarios/create for non-create routes', async () => {
		const session = { user: { id: '00000000-0000-0000-0000-000000000001' } };
		mocks.getAuthenticatedUserId.mockReturnValue(session.user.id);
		mocks.countScenariosForUser.mockResolvedValue(0);

		const event = {
			locals: {
				auth: vi.fn().mockResolvedValue(session)
			},
			url: new URL('http://localhost/dashboard')
		};

		await expect(protectedLayoutLoad(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/scenarios/create'
		});
	});

	it('allows access to scenarios/create when the user has no scenarios', async () => {
		const session = { user: { id: '00000000-0000-0000-0000-000000000001' } };
		mocks.getAuthenticatedUserId.mockReturnValue(session.user.id);
		mocks.countScenariosForUser.mockResolvedValue(0);

		const event = {
			locals: {
				auth: vi.fn().mockResolvedValue(session)
			},
			url: new URL('http://localhost/scenarios/create')
		};

		await expect(protectedLayoutLoad(event as never)).resolves.toEqual({
			scenarioCount: 0
		});
	});
});

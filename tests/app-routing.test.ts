import { describe, expect, it, vi } from 'vitest';

import { load as appLoad } from '../src/routes/(protected)/app/+page.server';

describe('app scenario routing', () => {
	it('redirects to the dashboard when the user has exactly one scenario', async () => {
		const event = {
			parent: vi.fn().mockResolvedValue({ scenarioCount: 1 })
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

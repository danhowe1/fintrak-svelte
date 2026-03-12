import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	signInWithAuth0: vi.fn(),
	signOut: vi.fn(),
	getProviderLogoutUrl: vi.fn()
}));

vi.mock('../src/auth.ts', () => ({
	signInWithAuth0: mocks.signInWithAuth0,
	signOut: mocks.signOut
}));

vi.mock('$lib/server/auth-config', () => ({
	getProviderLogoutUrl: mocks.getProviderLogoutUrl
}));

import { load as protectedLayoutLoad } from '../src/routes/(protected)/+layout.server';
import { GET as loginGet } from '../src/routes/login/+server';
import { GET as logoutGet, POST as logoutPost } from '../src/routes/logout/+server';

describe('auth smoke tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('redirects unauthenticated protected requests to login with the original callback URL', async () => {
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

	it('passes an explicit callback URL through the login endpoint', async () => {
		const event = {
			url: new URL('http://localhost/login?callbackUrl=%2Freports'),
			request: new Request('http://localhost/login?callbackUrl=%2Freports')
		};

		const response = await loginGet(event as never);

		expect(mocks.signInWithAuth0).toHaveBeenCalledWith(event, '/reports');
		expect(response.status).toBe(204);
	});

	it('defaults direct login to the app resolver when no callback URL is provided', async () => {
		const event = {
			url: new URL('http://localhost/login'),
			request: new Request('http://localhost/login')
		};

		await loginGet(event as never);

		expect(mocks.signInWithAuth0).toHaveBeenCalledWith(event, '/app');
	});

	it('redirects logout GET requests to the provider logout URL', async () => {
		mocks.getProviderLogoutUrl.mockReturnValue(
			new URL('https://example.auth0.com/v2/logout?client_id=test&returnTo=http://localhost/')
		);

		const event = {
			url: new URL('http://localhost/logout')
		};

		await expect(logoutGet(event as never)).rejects.toMatchObject({
			status: 303,
			location: 'https://example.auth0.com/v2/logout?client_id=test&returnTo=http://localhost/'
		});
		expect(mocks.getProviderLogoutUrl).toHaveBeenCalledWith('http://localhost');
	});

	it('clears the local session on logout POST', async () => {
		const event = {
			request: new Request('http://localhost/logout', { method: 'POST' })
		};

		const response = await logoutPost(event as never);

		expect(mocks.signOut).toHaveBeenCalledWith(event);
		expect(response.status).toBe(204);
	});
});

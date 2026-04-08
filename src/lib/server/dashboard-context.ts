import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getScenarioForUserById, getSingleScenarioForUser } from '$lib/server/database';

export type ProjectionRangeValue = '1y' | '5y' | '10y' | 'all';

export type DashboardScenarioRef = {
	id: string;
	name: string;
};

export const parseProjectionRange = (value: string | undefined | null): ProjectionRangeValue => {
	if (value === '1y' || value === '5y' || value === '10y' || value === 'all') {
		return value;
	}
	return 'all';
};

export const parseRateCookie = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveAuthenticatedUserId = (event: RequestEvent) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	return userId;
};

export const resolveDashboardScenario = async (event: RequestEvent) => {
	const userId = resolveAuthenticatedUserId(event);
	const scenarioId =
		event.url.searchParams.get('scenarioId') ?? event.cookies.get('currentScenarioId');
	const scenario = scenarioId
		? await getScenarioForUserById(userId, scenarioId)
		: await getSingleScenarioForUser(userId);

	return {
		userId,
		scenarioId,
		scenario: scenario ? ({ id: scenario.id, name: scenario.name } as DashboardScenarioRef) : null
	};
};

export const syncCurrentScenarioCookie = (
	event: RequestEvent,
	resolvedScenarioId: string | null | undefined
) => {
	if (!resolvedScenarioId) return;
	const currentScenarioId = event.cookies.get('currentScenarioId');
	if (resolvedScenarioId === currentScenarioId) return;
	event.cookies.set('currentScenarioId', resolvedScenarioId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax'
	});
};

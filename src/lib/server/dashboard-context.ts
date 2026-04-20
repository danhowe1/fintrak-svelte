import type { RequestEvent } from '@sveltejs/kit';

export type ProjectionRangeValue = '1y' | '5y' | '10y' | 'all';

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

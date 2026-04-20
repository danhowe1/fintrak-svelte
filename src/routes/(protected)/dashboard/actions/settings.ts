import type { RequestEvent } from '@sveltejs/kit';

export const settingsActions = {
	updateInflationRate: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		const inflationRate = Number(formData.get('inflationRate'));
		const deltaInflation = Number(formData.get('deltaInflation') ?? 0);
		const nextInflation = Number.isFinite(inflationRate)
			? Math.round((inflationRate + deltaInflation) * 10) / 10
			: 2.0;
		event.cookies.set('inflationRate', nextInflation.toFixed(1), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
		return { success: true };
	},

	updateRange: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		const nextRange = String(formData.get('projectionRange') ?? 'all');
		const projectionRange =
			nextRange === '1y' || nextRange === '5y' || nextRange === '10y' || nextRange === 'all'
				? nextRange
				: 'all';
		event.cookies.set('projectionRange', projectionRange, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
		return { success: true };
	}
};

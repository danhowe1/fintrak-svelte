import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { countScenariosForUser } from '$lib/server/database';

export const load: LayoutServerLoad = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const scenarioCount = await countScenariosForUser(userId);
	const defaultInflationRate = 2.0;
	const defaultInterestRateChange = 0.0;

	const parseRate = (value: string | undefined, fallback: number) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	};

	const inflationRate = parseRate(
		event.cookies.get('inflationRate'),
		defaultInflationRate
	);
	const interestRateChange = parseRate(
		event.cookies.get('interestRateChange'),
		defaultInterestRateChange
	);

	if (!event.cookies.get('inflationRate')) {
		event.cookies.set('inflationRate', defaultInflationRate.toFixed(1), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}

	if (!event.cookies.get('interestRateChange')) {
		event.cookies.set('interestRateChange', defaultInterestRateChange.toFixed(2), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax'
		});
	}

	const path = event.url.pathname;

	if (scenarioCount === 0 && path !== '/scenarios/create') {
		throw redirect(303, '/scenarios/create');
	}

	return {
		scenarioCount,
		sessionRates: {
			inflationRate,
			interestRateChange
		}
	};
};

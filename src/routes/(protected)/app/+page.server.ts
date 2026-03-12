import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { scenarioCount } = await event.parent();

	if (scenarioCount > 1) {
		throw redirect(303, '/scenarios');
	}

	throw redirect(303, '/dashboard');
};

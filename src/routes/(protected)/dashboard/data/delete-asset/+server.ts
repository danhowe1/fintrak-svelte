import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteAssetForScenario, getScenarioForUserById } from '$lib/server/database';

export const POST: RequestHandler = async (event) => {
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(event.url.pathname);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}

	const formData = await event.request.formData();
	const scenarioId = String(formData.get('scenarioId') ?? '');
	const assetId = String(formData.get('assetId') ?? '');

	if (!scenarioId || !assetId) {
		return json({ error: 'Invalid asset deletion input.' }, { status: 400 });
	}

	const scenario = await getScenarioForUserById(userId, scenarioId);
	if (!scenario) {
		return json({ error: 'Scenario not found.' }, { status: 404 });
	}

	try {
		await deleteAssetForScenario(scenarioId, assetId);
		return json({ success: true });
	} catch (error) {
		return json(
			{
				error:
					error instanceof Error
						? error.message
						: 'Unable to delete asset. Please try again.'
			},
			{ status: 400 }
		);
	}
};

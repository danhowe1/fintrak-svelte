import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	cloneScenarioForUser,
	deleteScenarioForOwner,
	getProjectionBundlesForUser,
	getSingleScenarioForUser,
	renameScenarioForOwner
} from '$lib/server/database';
import { buildProjection } from '$lib/server/projection';
import { parseProjectionRange } from '$lib/server/dashboard-context';
import { z } from 'zod';

const isScenarioNameConflict = (error: unknown) => {
	const candidate = error as { code?: string; constraint?: string } | undefined;
	return candidate?.code === '23505' && candidate?.constraint === 'scenarios_created_by_name_key';
};

const cloneScenarioSchema = z.object({
	scenarioId: z.string().trim().min(1, 'Scenario id is required.'),
	scenarioName: z.string().trim().min(1, 'Scenario name is required.')
});

const renameScenarioSchema = z.object({
	scenarioId: z.string().trim().min(1, 'Scenario id is required.'),
	scenarioName: z.string().trim().min(1, 'Scenario name is required.')
});

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	const userId = event.locals.appUserId;
	if (!userId) {
		const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
		throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
	}
	const projectionRange = parseProjectionRange(
		event.url.searchParams.get('projectionRange') ?? event.cookies.get('projectionRange')
	);
	const projectionBundles = await getProjectionBundlesForUser(userId);
	const scenarios = projectionBundles.map((bundle) => bundle.scenario);
	const scenarioProjections = projectionBundles.map((bundle) => ({
		scenarioId: bundle.scenario.id,
		scenarioName: bundle.scenario.name,
		projection: buildProjection({
			inflationRate: parentData.sessionRates.inflationRate,
			projectionRange: 'all',
			maxMonths: null,
			cashflows: bundle.cashflows,
			accounts: bundle.accounts,
			assets: bundle.assets,
			assetAccounts: bundle.assetAccounts,
			autoFundingRules: bundle.autoFundingRules,
			accountBalanceTargets: bundle.accountBalanceTargets,
			autoSweepRules: bundle.autoSweepRules
		})
	}));

	return {
		scenarios,
		scenarioProjections,
		projectionRange
	};
};

export const actions: Actions = {
	rename: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}

		const formData = await event.request.formData();
		const parsed = renameScenarioSchema.safeParse({
			scenarioId: formData.get('scenarioId'),
			scenarioName: formData.get('scenarioName')
		});

		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid rename request.' });
		}

		const renamedScenario = await renameScenarioForOwner(
			userId,
			parsed.data.scenarioId,
			parsed.data.scenarioName
		).catch((error) => {
			if (isScenarioNameConflict(error)) {
				return 'duplicate';
			}
			throw error;
		});
		if (renamedScenario === 'duplicate') {
			return fail(400, { error: 'You already have a scenario with that name.' });
		}
		if (!renamedScenario) {
			return fail(403, { error: 'Only the scenario owner can rename this scenario.' });
		}

		throw redirect(303, '/scenarios');
	},
	clone: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}

		const formData = await event.request.formData();
		const parsed = cloneScenarioSchema.safeParse({
			scenarioId: formData.get('scenarioId'),
			scenarioName: formData.get('scenarioName')
		});

		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Invalid clone request.' });
		}

		try {
			await cloneScenarioForUser({
				userId,
				sourceScenarioId: parsed.data.scenarioId,
				scenarioName: parsed.data.scenarioName
			});
		} catch (error) {
			if (isScenarioNameConflict(error)) {
				return fail(400, { error: 'You already have a scenario with that name.' });
			}
			return fail(400, {
				error: error instanceof Error ? error.message : 'Unable to clone scenario.'
			});
		}

		throw redirect(303, '/scenarios');
	},
	delete: async (event) => {
		const userId = event.locals.appUserId;
		if (!userId) {
			const callbackUrl = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/login?callbackUrl=${callbackUrl}`);
		}

		const formData = await event.request.formData();
		const scenarioId = formData.get('scenarioId');
		if (typeof scenarioId !== 'string' || scenarioId.trim() === '') {
			return fail(400, { error: 'Scenario id is required.' });
		}

		const deletedScenario = await deleteScenarioForOwner(userId, scenarioId);
		if (!deletedScenario) {
			return fail(403, { error: 'Only the scenario owner can delete this scenario.' });
		}

		const currentScenarioId = event.cookies.get('currentScenarioId');
		if (currentScenarioId === scenarioId) {
			const nextScenario = await getSingleScenarioForUser(userId);
			if (nextScenario) {
				event.cookies.set('currentScenarioId', nextScenario.id, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax'
				});
			} else {
				event.cookies.delete('currentScenarioId', { path: '/' });
			}
		}

		const remainingScenario = await getSingleScenarioForUser(userId);
		throw redirect(303, remainingScenario ? '/scenarios' : '/scenarios/create');
	}
};

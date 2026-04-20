import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAccountsForScenario, getAssetsForScenario, getScenarioForUserById } from '$lib/server/database';

const validAssetTypes = new Set(['person', 'property', 'mortgage', 'superannuation', 'shares']);

export const GET: RequestHandler = async (event) => {
	const userId = event.locals.appUserId;

	const scenarioId = event.cookies.get('currentScenarioId');
	if (!scenarioId) {
		return json({ message: 'No active scenario selected.' }, { status: 400 });
	}

	const assetType = event.params.assetType;
	if (!validAssetTypes.has(assetType)) {
		return json({ message: 'Unsupported asset type.' }, { status: 400 });
	}

	const scenario = await getScenarioForUserById(userId, scenarioId);
	if (!scenario) {
		return json({ message: 'Scenario not found.' }, { status: 404 });
	}

	const [accounts, assets] = await Promise.all([
		getAccountsForScenario(scenario.id),
		getAssetsForScenario(scenario.id)
	]);

	const properties = assets
		.filter((asset) => asset.asset_type === 'property')
		.map((property) => ({ id: property.id, name: property.name, details: property.details ?? null }));
	const people = assets
		.filter((asset) => asset.asset_type === 'person')
		.map((person) => ({ id: person.id, name: person.name }));
	const cashAccounts = accounts
		.filter((account) => account.account_type === 'cash_account')
		.map((account) => ({ id: account.id, name: account.name }));

	return json({
		scenario: { id: scenario.id, name: scenario.name },
		accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
		properties,
		people,
		cashAccounts,
		hasPrimaryResidence: properties.some(
			(asset) => asset.details?.propertyUse === 'primary_residence'
		),
		defaultPropertyUse: properties.length === 0 ? 'primary_residence' : 'investment_property'
	});
};

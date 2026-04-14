type AssetType = 'person' | 'property' | 'mortgage' | 'superannuation' | 'shares';
type AccountType = 'cash_account' | 'mortgage_account' | 'credit_card' | 'brokerage' | 'super_account';
type RelationshipRole = 'held_in' | 'funding_source' | 'offsets' | 'secured_by' | 'pays_into';

export type AssetDeletionAsset = {
	id: string;
	asset_type: AssetType;
	property_id?: string | null;
	person_id?: string | null;
	name?: string | null;
};

export type AssetDeletionAccount = {
	id: string;
	account_type: AccountType;
	name?: string | null;
};

export type AssetDeletionAssetAccount = {
	id: string;
	asset_id: string;
	account_id: string;
	relationship_role: RelationshipRole;
};

export type AssetDeletionPlan = {
	assetIdsToDelete: string[];
	fixedAccountIdsToDelete: string[];
	assetAccountIdsToDelete: string[];
};

const FIXED_ACCOUNT_TYPES_BY_ASSET_TYPE: Partial<Record<AssetType, AccountType>> = {
	mortgage: 'mortgage_account',
	shares: 'brokerage',
	superannuation: 'super_account'
};

export const planAssetDeletion = (input: {
	assetId: string;
	assets: AssetDeletionAsset[];
	accounts: AssetDeletionAccount[];
	assetAccounts: AssetDeletionAssetAccount[];
}): AssetDeletionPlan => {
	const { assetId, assets, accounts, assetAccounts } = input;
	const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
	const accountsById = new Map(accounts.map((account) => [account.id, account]));
	const targetAsset = assetsById.get(assetId);

	if (!targetAsset) {
		throw new Error('Asset not found.');
	}

	const assetIdsToDelete = new Set<string>();
	const pendingAssetIds = [assetId];

	while (pendingAssetIds.length > 0) {
		const currentAssetId = pendingAssetIds.pop();
		if (!currentAssetId || assetIdsToDelete.has(currentAssetId)) continue;
		assetIdsToDelete.add(currentAssetId);

		for (const asset of assets) {
			if (asset.property_id === currentAssetId || asset.person_id === currentAssetId) {
				pendingAssetIds.push(asset.id);
			}
		}
	}

	const personAssetsRemaining = assets.filter(
		(asset) => asset.asset_type === 'person' && !assetIdsToDelete.has(asset.id)
	).length;
	if (personAssetsRemaining < 1) {
		throw new Error("You can't delete the only person.");
	}

	const fixedAccountIdsToDelete = new Set<string>();
	for (const deletingAssetId of assetIdsToDelete) {
		const deletingAsset = assetsById.get(deletingAssetId);
		if (!deletingAsset) continue;
		const expectedAccountType = FIXED_ACCOUNT_TYPES_BY_ASSET_TYPE[deletingAsset.asset_type];
		if (!expectedAccountType) continue;

		for (const link of assetAccounts) {
			if (link.asset_id !== deletingAssetId || link.relationship_role !== 'held_in') continue;
			const account = accountsById.get(link.account_id);
			if (account?.account_type === expectedAccountType) {
				fixedAccountIdsToDelete.add(account.id);
			}
		}
	}

	const cashAccountsRemaining = accounts.filter(
		(account) => account.account_type === 'cash_account' && !fixedAccountIdsToDelete.has(account.id)
	).length;
	if (cashAccountsRemaining < 1) {
		throw new Error("You can't delete the only cash account.");
	}

	const assetAccountIdsToDelete = assetAccounts
		.filter(
			(link) => assetIdsToDelete.has(link.asset_id) || fixedAccountIdsToDelete.has(link.account_id)
		)
		.map((link) => link.id);

	return {
		assetIdsToDelete: Array.from(assetIdsToDelete),
		fixedAccountIdsToDelete: Array.from(fixedAccountIdsToDelete),
		assetAccountIdsToDelete
	};
};

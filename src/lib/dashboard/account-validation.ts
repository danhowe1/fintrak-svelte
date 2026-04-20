import type { AssetAccountLink, AssetListItem } from '$lib/server/database';

export function buildAssetByAccountId(
	assetAccounts: AssetAccountLink[],
	assets: AssetListItem[],
	assetType: string
): Map<string, string> {
	const assetsById = new Map(assets.map((a) => [a.id, a]));
	const result = new Map<string, string>();
	for (const link of assetAccounts) {
		if (link.relationship_role !== 'held_in') continue;
		const asset = assetsById.get(link.asset_id);
		if (!asset || asset.asset_type !== assetType) continue;
		if (!result.has(link.account_id)) {
			result.set(link.account_id, link.asset_id);
		}
	}
	return result;
}

export function buildOffsetAccountIds(assetAccounts: AssetAccountLink[]): Set<string> {
	return new Set(
		assetAccounts
			.filter((link) => link.relationship_role === 'offsets')
			.map((link) => link.account_id)
	);
}

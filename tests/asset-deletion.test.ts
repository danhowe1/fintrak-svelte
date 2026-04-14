import { describe, expect, it } from 'vitest';
import { planAssetDeletion } from '../src/lib/server/asset-deletion';

describe('asset deletion planning', () => {
	it('includes dependent super assets and only deletes fixed super accounts', () => {
		const plan = planAssetDeletion({
			assetId: 'person-1',
			assets: [
				{ id: 'person-1', asset_type: 'person' },
				{ id: 'person-2', asset_type: 'person' },
				{ id: 'super-1', asset_type: 'superannuation', person_id: 'person-1' }
			],
			accounts: [
				{ id: 'cash-1', account_type: 'cash_account' },
				{ id: 'cash-2', account_type: 'cash_account' },
				{ id: 'super-account-1', account_type: 'super_account' }
			],
			assetAccounts: [
				{
					id: 'aa-person-cash',
					asset_id: 'person-1',
					account_id: 'cash-1',
					relationship_role: 'held_in'
				},
				{
					id: 'aa-super-held',
					asset_id: 'super-1',
					account_id: 'super-account-1',
					relationship_role: 'held_in'
				},
				{
					id: 'aa-super-payout',
					asset_id: 'super-1',
					account_id: 'cash-2',
					relationship_role: 'pays_into'
				}
			]
		});

		expect(plan.assetIdsToDelete.sort()).toEqual(['person-1', 'super-1']);
		expect(plan.fixedAccountIdsToDelete).toEqual(['super-account-1']);
		expect(plan.assetAccountIdsToDelete.sort()).toEqual([
			'aa-person-cash',
			'aa-super-held',
			'aa-super-payout'
		]);
	});

	it('deletes a shares brokerage but keeps its pays-into cash account', () => {
		const plan = planAssetDeletion({
			assetId: 'shares-1',
			assets: [
				{ id: 'person-1', asset_type: 'person' },
				{ id: 'shares-1', asset_type: 'shares' }
			],
			accounts: [
				{ id: 'broker-1', account_type: 'brokerage' },
				{ id: 'cash-1', account_type: 'cash_account' }
			],
			assetAccounts: [
				{
					id: 'aa-broker',
					asset_id: 'shares-1',
					account_id: 'broker-1',
					relationship_role: 'held_in'
				},
				{
					id: 'aa-cash',
					asset_id: 'shares-1',
					account_id: 'cash-1',
					relationship_role: 'pays_into'
				}
			]
		});

		expect(plan.fixedAccountIdsToDelete).toEqual(['broker-1']);
		expect(plan.assetAccountIdsToDelete.sort()).toEqual(['aa-broker', 'aa-cash']);
	});

	it('rejects deleting the final person asset in a scenario', () => {
		expect(() =>
			planAssetDeletion({
				assetId: 'person-1',
				assets: [{ id: 'person-1', asset_type: 'person' }],
				accounts: [{ id: 'cash-1', account_type: 'cash_account' }],
				assetAccounts: []
			})
		).toThrow("You can't delete the only person.");
	});
});

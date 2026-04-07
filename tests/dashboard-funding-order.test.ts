import { describe, expect, it } from 'vitest';
import {
	applyReserveOrderOverrides,
	applySweepPriorityOrder,
	reorderRuleIds
} from '../src/lib/dashboard/funding-order';

describe('dashboard funding order helpers', () => {
	it('applies reserve order overrides and cleans invalid overrides', () => {
		const rules = [
			{
				id: 'r1',
				source_account_id: 's1',
				target_account_id: 't1',
				priority_order: 1,
				created_at: '2025-01-01'
			},
			{
				id: 'r2',
				source_account_id: 's2',
				target_account_id: 't1',
				priority_order: 2,
				created_at: '2025-01-02'
			}
		];
		const result = applyReserveOrderOverrides(rules, { t1: ['r2', 'r1'], t2: ['x'] });
		expect(result.overrides).toEqual({ t1: ['r2', 'r1'] });
		expect(result.rules.find((rule) => rule.id === 'r2')?.priority_order).toBe(1);
		expect(result.rules.find((rule) => rule.id === 'r1')?.priority_order).toBe(2);
	});

	it('reorders ids by direction', () => {
		const ids = reorderRuleIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b', 1);
		expect(ids).toEqual(['a', 'c', 'b']);
		expect(reorderRuleIds([{ id: 'a' }], 'a', 1)).toBeNull();
	});

	it('applies sweep priority order to one source account', () => {
		const rules = [
			{
				id: 'x1',
				scenario_id: 'sc',
				source_account_id: 's1',
				destination_account_id: 'd1',
				priority_order: 1,
				enabled: true,
				created_at: '',
				updated_at: ''
			},
			{
				id: 'x2',
				scenario_id: 'sc',
				source_account_id: 's1',
				destination_account_id: 'd2',
				priority_order: 2,
				enabled: true,
				created_at: '',
				updated_at: ''
			},
			{
				id: 'x3',
				scenario_id: 'sc',
				source_account_id: 's2',
				destination_account_id: 'd3',
				priority_order: 1,
				enabled: true,
				created_at: '',
				updated_at: ''
			}
		];
		const updated = applySweepPriorityOrder(rules, 's1', ['x2', 'x1']);
		expect(updated.find((r) => r.id === 'x2')?.priority_order).toBe(1);
		expect(updated.find((r) => r.id === 'x1')?.priority_order).toBe(2);
		expect(updated.find((r) => r.id === 'x3')?.priority_order).toBe(1);
	});
});

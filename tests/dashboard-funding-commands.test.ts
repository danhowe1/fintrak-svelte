import { describe, expect, it, vi } from 'vitest';
import {
	addReserveRuleForTargetCommand,
	addSweepRuleForSourceCommand,
	moveReserveRuleCommand,
	moveSweepRuleCommand,
	removeReserveRuleCommand,
	removeSweepRuleCommand,
	upsertFundingTargetForAccountCommand
} from '../src/lib/dashboard/funding-commands';

describe('dashboard funding commands', () => {
	it('validates reserve/cap drafts before posting', async () => {
		const error = await upsertFundingTargetForAccountCommand({
			accountId: 'a1',
			minDraft: '-1',
			maxDraft: '',
			scenarioId: 'sc',
			autoRunProjection: true,
			withLock: vi.fn(async (_k, cb) => cb()),
			postAction: vi.fn(),
			setAccountBalanceTargets: vi.fn(),
			refreshProjection: vi.fn(async () => {})
		});
		expect(error).toContain('Reserve must be a number');
	});

	it('adds reserve rule with optimistic update and final payload replacement', async () => {
		const setAutoFundingRules = vi.fn();
		const postAction = vi.fn(async () => ({ autoFundingRules: [{ id: 'final' }] }));
		const error = await addReserveRuleForTargetCommand({
			targetAccountId: 'cash-1',
			selectedSourceAccountId: 'src-1',
			scenarioId: 'sc',
			autoRunProjection: true,
			autoFundingRules: [],
			withLock: vi.fn(async (_k, cb) => cb()),
			postAction,
			setAutoFundingRules,
			refreshProjection: vi.fn(async () => {})
		});
		expect(error).toBe('');
		expect(setAutoFundingRules).toHaveBeenCalledTimes(2);
		expect(postAction).toHaveBeenCalledWith(
			'upsertAutoFundingRule',
			expect.any(FormData),
			'Unable to add reserve funding rule.'
		);
	});

	it('rolls back reserve delete on failure', async () => {
		const setAutoFundingRules = vi.fn();
		const original = [{ id: 'r1' }, { id: 'r2' }];
		const error = await removeReserveRuleCommand({
			ruleId: 'r1',
			scenarioId: 'sc',
			autoRunProjection: true,
			autoFundingRules: original,
			withLock: vi.fn(async () => {
				throw new Error('fail');
			}),
			postAction: vi.fn(),
			setAutoFundingRules,
			refreshProjection: vi.fn(async () => {})
		});
		expect(error).toBe('fail');
		expect(setAutoFundingRules).toHaveBeenLastCalledWith(original);
	});

	it('moves reserve rule and writes override order', async () => {
		const setReserveOrderOverride = vi.fn();
		const setAutoFundingRules = vi.fn();
		const error = await moveReserveRuleCommand({
			targetAccountId: 't1',
			ruleId: 'r2',
			direction: -1,
			scenarioId: 'sc',
			autoRunProjection: true,
			autoFundingRules: [
				{ id: 'r1', target_account_id: 't1', priority_order: 1 },
				{ id: 'r2', target_account_id: 't1', priority_order: 2 }
			] as any[],
			withLock: vi.fn(async (_k, cb) => cb()),
			postAction: vi.fn(async () => ({})),
			setAutoFundingRules,
			refreshProjection: vi.fn(async () => {}),
			setReserveOrderOverride
		});
		expect(error).toBe('');
		expect(setReserveOrderOverride).toHaveBeenCalledWith('t1', ['r2', 'r1']);
	});

	it('adds/removes/moves sweep rules with expected errors and posts', async () => {
		const missingDest = await addSweepRuleForSourceCommand({
			sourceAccountId: 's1',
			selectedDestinationAccountId: '',
			scenarioId: 'sc',
			autoRunProjection: true,
			autoSweepRules: [],
			withLock: vi.fn(async (_k, cb) => cb()),
			postAction: vi.fn(),
			setAutoSweepRules: vi.fn(),
			refreshProjection: vi.fn(async () => {})
		});
		expect(missingDest).toContain('Select an auto-sweep destination account');

		const setAutoSweepRules = vi.fn();
		const removeErr = await removeSweepRuleCommand({
			ruleId: 'x1',
			scenarioId: 'sc',
			autoRunProjection: true,
			autoSweepRules: [{ id: 'x1' }],
			withLock: vi.fn(async () => {
				throw new Error('delete failed');
			}),
			postAction: vi.fn(),
			setAutoSweepRules,
			refreshProjection: vi.fn(async () => {})
		});
		expect(removeErr).toBe('delete failed');

		const moveErr = await moveSweepRuleCommand({
			sourceAccountId: 's1',
			ruleId: 'x2',
			direction: -1,
			scenarioId: 'sc',
			autoRunProjection: true,
			autoSweepRules: [
				{ id: 'x1', source_account_id: 's1', priority_order: 1 },
				{ id: 'x2', source_account_id: 's1', priority_order: 2 }
			] as any[],
			withLock: vi.fn(async (_k, cb) => cb()),
			postAction: vi.fn(async () => ({})),
			setAutoSweepRules: vi.fn(),
			refreshProjection: vi.fn(async () => {})
		});
		expect(moveErr).toBe('');
	});
});

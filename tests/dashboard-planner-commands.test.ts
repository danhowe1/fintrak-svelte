import { describe, expect, it, vi } from 'vitest';
import {
	jumpToWhatIfFundingInput,
	removeAutoFundingRuleCommand,
	saveAutoFundingRuleCommand
} from '../src/lib/dashboard/planner-commands';

describe('dashboard planner command helpers', () => {
	it('returns validation error when source account is missing', async () => {
		const result = await saveAutoFundingRuleCommand({
			stage2AllocationShortfall: { targetAccountId: 'target-1' },
			plannerSourceAccountId: '',
			scenarioId: 'sc-1',
			autoRunProjection: true,
			withLock: vi.fn(async (_key, callback) => callback()),
			postAction: vi.fn(),
			setAutoFundingRules: vi.fn(),
			refreshProjection: vi.fn(async () => {})
		});
		expect(result.autoFundingRuleError).toBe('Select a source account.');
		expect(result.projectionError).toBeNull();
	});

	it('saves auto-funding rule and clears source selection', async () => {
		const setAutoFundingRules = vi.fn();
		const refreshProjection = vi.fn(async () => {});
		const postAction = vi.fn(async () => ({ autoFundingRules: [{ id: 'r1' }] }));
		const result = await saveAutoFundingRuleCommand({
			stage2AllocationShortfall: { targetAccountId: 'target-1' },
			plannerSourceAccountId: 'src-1',
			scenarioId: 'sc-1',
			autoRunProjection: true,
			withLock: vi.fn(async (_key, callback) => callback()),
			postAction,
			setAutoFundingRules,
			refreshProjection
		});
		expect(postAction).toHaveBeenCalledWith(
			'upsertAutoFundingRule',
			expect.any(FormData),
			'Unable to save auto-funding rule.'
		);
		expect(setAutoFundingRules).toHaveBeenCalledWith([{ id: 'r1' }]);
		expect(refreshProjection).toHaveBeenCalledWith({ includeCashflows: true, force: true });
		expect(result.nextPlannerSourceAccountId).toBe('');
		expect(result.autoFundingRuleError).toBe('');
	});

	it('removes auto-funding rule and maps lock errors', async () => {
		const result = await removeAutoFundingRuleCommand({
			ruleId: 'rule-1',
			scenarioId: 'sc-1',
			autoRunProjection: true,
			withLock: vi.fn(async () => {
				throw new Error('boom');
			}),
			postAction: vi.fn(async () => ({})),
			setAutoFundingRules: vi.fn(),
			refreshProjection: vi.fn(async () => {})
		});
		expect(result.autoFundingRuleError).toBe('boom');
		expect(result.projectionError).toBe('boom');
	});

	it('jumps to reserve/cap inputs and focuses target element', async () => {
		const setAssetPanelTab = vi.fn();
		const tick = vi.fn(async () => {});
		const panel = { scrollIntoView: vi.fn() } as any;
		const input = {
			scrollIntoView: vi.fn(),
			focus: vi.fn(),
			select: vi.fn()
		} as any;
		await jumpToWhatIfFundingInput({
			tab: 'reserves',
			firstCashAccountId: 'cash-1',
			setAssetPanelTab,
			tick,
			whatIfPanelElement: panel,
			getElementById: (id) => (id === 'reserve-amount-input-cash-1' ? input : null)
		});
		expect(setAssetPanelTab).toHaveBeenCalledWith('reserves');
		expect(input.focus).toHaveBeenCalled();
	});
});

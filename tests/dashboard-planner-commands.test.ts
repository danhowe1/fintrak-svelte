import { describe, expect, it, vi } from 'vitest';
import { jumpToWhatIfFundingInput } from '../src/lib/dashboard/planner-commands';

describe('dashboard planner command helpers', () => {
	it('jumps to reserve fallback input when no selector is available', async () => {
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
			targetAccountId: 'cash-1',
			setAssetPanelTab,
			tick,
			whatIfPanelElement: panel,
			getElementById: (id) => (id === 'reserve-amount-input-cash-1' ? input : null)
		});
		expect(setAssetPanelTab).toHaveBeenCalledWith('reserves');
		expect(input.focus).toHaveBeenCalled();
	});

	it('jumps to the next available reserve selector when earlier priorities are filled', async () => {
		const setAssetPanelTab = vi.fn();
		const tick = vi.fn(async () => {});
		const panel = { scrollIntoView: vi.fn() } as any;
		const select = {
			scrollIntoView: vi.fn(),
			focus: vi.fn()
		} as any;
		await jumpToWhatIfFundingInput({
			tab: 'reserves',
			targetAccountId: 'cash-1',
			setAssetPanelTab,
			tick,
			whatIfPanelElement: panel,
			getElementById: (id) => (id === 'reserve-source-select-cash-1-2' ? select : null)
		});
		expect(setAssetPanelTab).toHaveBeenCalledWith('reserves');
		expect(select.focus).toHaveBeenCalled();
	});
});

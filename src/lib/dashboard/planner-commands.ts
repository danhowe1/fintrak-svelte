export const jumpToWhatIfFundingInput = async (params: {
	tab: 'reserves' | 'caps';
	targetAccountId: string;
	focusTarget?: 'amount' | 'priority';
	setAssetPanelTab: (tab: 'reserves' | 'caps') => void;
	tick: () => Promise<void>;
	whatIfPanelElement: HTMLElement | null;
	getElementById: (id: string) => HTMLElement | null;
}) => {
	const {
		tab,
		targetAccountId,
		focusTarget = 'priority',
		setAssetPanelTab,
		tick,
		whatIfPanelElement,
		getElementById
	} = params;
	const findFirstPrioritySelect = () => {
		for (let priority = 1; priority <= 20; priority += 1) {
			const elementId =
				tab === 'reserves'
					? `reserve-source-select-${targetAccountId}-${priority}`
					: `cap-destination-select-${targetAccountId}-${priority}`;
			const element = getElementById(elementId);
			if (element) return element as HTMLSelectElement;
		}
		return null;
	};
	setAssetPanelTab(tab);
	await tick();
	whatIfPanelElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	if (!targetAccountId) return;
	const fallbackInputId =
		tab === 'reserves'
			? `reserve-amount-input-${targetAccountId}`
			: `cap-amount-input-${targetAccountId}`;
	const amountInput = getElementById(fallbackInputId) as HTMLInputElement | null;
	const targetInput =
		focusTarget === 'amount' ? amountInput : findFirstPrioritySelect() ?? amountInput;
	targetInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	targetInput?.focus({ preventScroll: true });
	try {
		if (targetInput instanceof HTMLInputElement) {
			targetInput.select();
		}
	} catch {
		// Number inputs may not support text selection across browsers.
	}
};

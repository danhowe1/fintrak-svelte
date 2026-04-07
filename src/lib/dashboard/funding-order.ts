type FundingRuleWithCreated = {
	id: string;
	target_account_id: string;
	priority_order: number;
	created_at?: string;
};

export const applyReserveOrderOverrides = <TRule extends FundingRuleWithCreated>(
	rules: TRule[],
	overridesInput: Record<string, string[]>
): {
	rules: TRule[];
	overrides: Record<string, string[]>;
} => {
	const overrides = { ...overridesInput };
	const normalized = (rules ?? []).map((rule) => ({ ...rule }));
	for (const [targetAccountId, orderedRuleIds] of Object.entries(overrides)) {
		const targetRules = normalized.filter((rule) => rule.target_account_id === targetAccountId);
		if (targetRules.length === 0 || orderedRuleIds.length !== targetRules.length) {
			delete overrides[targetAccountId];
			continue;
		}
		const targetRuleIds = new Set(targetRules.map((rule) => rule.id));
		if (orderedRuleIds.some((ruleId) => !targetRuleIds.has(ruleId))) {
			delete overrides[targetAccountId];
			continue;
		}
		const rulesById = new Map(targetRules.map((rule) => [rule.id, rule]));
		orderedRuleIds.forEach((ruleId, index) => {
			const matchingRule = rulesById.get(ruleId);
			if (matchingRule) matchingRule.priority_order = index + 1;
		});
	}
	normalized.sort(
		(a, b) =>
			a.target_account_id.localeCompare(b.target_account_id) ||
			a.priority_order - b.priority_order ||
			(a.created_at ?? '').localeCompare(b.created_at ?? '')
	);
	return { rules: normalized, overrides };
};

type RuleWithId = { id: string };

export const reorderRuleIds = <TRule extends RuleWithId>(
	rules: TRule[],
	ruleId: string,
	direction: -1 | 1
): string[] | null => {
	const index = rules.findIndex((rule) => rule.id === ruleId);
	if (index < 0) return null;
	const swapIndex = index + direction;
	if (swapIndex < 0 || swapIndex >= rules.length) return null;
	const reordered = [...rules];
	const [moved] = reordered.splice(index, 1);
	reordered.splice(swapIndex, 0, moved);
	return reordered.map((rule) => rule.id);
};

export const applySweepPriorityOrder = <
	TRule extends { id: string; source_account_id: string; priority_order: number }
>(
	allRules: TRule[],
	sourceAccountId: string,
	reorderedIds: string[]
): TRule[] =>
	allRules.map((rule) => {
		if (rule.source_account_id !== sourceAccountId) return rule;
		const nextIndex = reorderedIds.indexOf(rule.id);
		return nextIndex < 0 ? rule : { ...rule, priority_order: nextIndex + 1 };
	});

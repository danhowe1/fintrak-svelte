<script lang="ts">
	import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';

	export let stage1Passed: boolean;
	export let plannerStage: string;
	export let stage1PlannerMessage: string;
	export let assetsList: Array<{ asset_type?: string }>;
	export let jumpToWhatIfAssetsExpense: () => void;

	export let stage2Reached: boolean;
	export let stage2Passed: boolean;
	export let stage2PlannerMessage: string | null | undefined;
	export let stage2AccessibilityShortfall: any;
	export let plannerExistingRules: any[] | null;
	export let accountsList: Array<{ id: string; name?: string }>;
	export let removeAutoFundingRule: (ruleId: string) => void;
	export let plannerSourceAccountId: string;
	export let plannerSourceOptions: Array<{ id: string; name: string }>;
	export let plannerSourceAvailabilityWarning: string;
	export let saveAutoFundingRule: () => void;
	export let autoFundingRuleError: string;

	export let plannerAdvancedOpenStage: 'stage3' | 'stage4';
	export let stage3Reached: boolean;
	export let stage3Passed: boolean;
	export let stage3Assessment: any;
	export let stage4Reached: boolean;
	export let stage4Passed: boolean;
	export let jumpToWhatIfReserves: () => void;
	export let jumpToWhatIfCaps: () => void;
	export let monthLabelFromDate: (value?: unknown | null) => string;

	export let projectionEvents: Array<{
		tone: 'negative' | 'positive';
		monthLabel: string | null;
		message: string;
	}>;
	export let isInitialProjectionLoading: boolean;
</script>

<div class="space-y-4">
	<div class="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
		<h3 class="text-sm font-semibold text-slate-900">Funding Planner</h3>
		<div
			class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${stage1Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
		>
			<div class="flex items-center gap-2">
				<span class="font-semibold">Stage 1: Liquidity</span>
				<InfoTooltip label="What is Stage 1 liquidity?">
					Stage 1 checks whether you are living within your means by seeing if you run out of accessible
					money in any month. Accessible money is in either cash accounts, shares or pension/superannuation
					funds (if available).
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${stage1Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
			>
				{stage1Passed ? '✓' : '✕'}
			</span>
		</div>
		{#if stage1Passed}
			<div class="mt-2 text-xs text-emerald-700">You are living within your means.</div>
		{/if}
		{#if plannerStage === 'liquidity'}
			<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
				{stage1PlannerMessage}
			</div>
			<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
				<div class="font-semibold">Fix Liquidity First</div>
				<div class="mt-1 text-xs">
					You need to reduce your expenses or increase your income to ensure your liquidity.
				</div>
				<div class="mt-3 text-xs font-semibold">Ways you can fix your liquidity:</div>
				<ul class="mt-2 list-disc pl-5 text-xs">
					<li>Reduce or remove expenses.</li>
					<li>Increase income or add an income stream.</li>
					<li>Add an income generating asset.</li>
					<li>
						Sell an asset to bring in income{assetsList.some((asset) => asset.asset_type === 'property')
							? ' (e.g. property).'
							: '.'}
					</li>
				</ul>
				<div class="mt-2 text-xs">
					Head down to the
					<a
						href="#what-if-panel"
						class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
						on:click|preventDefault={jumpToWhatIfAssetsExpense}
					>
						What if?...
					</a>
					section below to make your changes.
				</div>
			</div>
		{/if}

		<div
			class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${!stage2Reached ? 'border-slate-200 bg-slate-50 text-slate-500' : stage2Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
		>
			<div class="flex items-center gap-2">
				<span class="font-semibold">Stage 2: Accessibility</span>
				<InfoTooltip label="What is Stage 2 accessibility?">
					Once we've established you have enough to live on we need to ensure all of your accounts
					remain in the black. Stage 2 is about ensuring you have access to funds when you need them.
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${!stage2Reached ? 'bg-slate-100 text-slate-500' : stage2Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
			>
				{!stage2Reached ? '?' : stage2Passed ? '✓' : '✕'}
			</span>
		</div>
		{#if stage2Passed}
			<div class="mt-2 text-xs text-emerald-700">None of your accounts run out of money.</div>
		{/if}
		{#if stage2Reached && !stage2Passed}
			<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
				{stage2PlannerMessage}
			</div>
			{#if stage2AccessibilityShortfall}
				<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
					<div class="font-semibold">
						Stage 2: Accessibility for {stage2AccessibilityShortfall.targetAccountName} from {stage2AccessibilityShortfall.monthLabel}
						from which account...
					</div>
					{#if (plannerExistingRules?.length ?? 0) > 0}
						<div class="mt-2 space-y-1 text-xs">
							{#each plannerExistingRules ?? [] as rule}
								{@const sourceAccountName =
									accountsList.find((account) => account.id === rule.source_account_id)?.name ??
										'Source account'}
								<div
									class="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1"
								>
									<span>Priority {rule.priority_order}: {sourceAccountName}</span>
									<button
										type="button"
										class="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
										on:click={() => removeAutoFundingRule(rule.id)}
									>
										Remove
									</button>
								</div>
							{/each}
						</div>
					{/if}
					<div class="mt-2 block text-xs text-slate-600">
						<select
							class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
							bind:value={plannerSourceAccountId}
						>
							{#if plannerSourceOptions.length === 0}
								<option value="">No valid funding accounts</option>
							{:else}
								<option value="">Add next funding account...</option>
								{#each plannerSourceOptions as option}
									<option value={option.id}>{option.name}</option>
								{/each}
							{/if}
						</select>
					</div>
					{#if plannerSourceAvailabilityWarning}
						<div class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
							{plannerSourceAvailabilityWarning}
						</div>
					{/if}
					<div class="mt-2">
						<button
							type="button"
							class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
							disabled={!plannerSourceAccountId || plannerSourceOptions.length === 0}
							on:click={saveAutoFundingRule}
						>
							Add Funding Account
						</button>
					</div>
					{#if autoFundingRuleError}
						<div class="mt-2 text-xs text-rose-600">{autoFundingRuleError}</div>
					{/if}
				</div>
			{:else}
				<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
					Stage 2 is active. Review auto-funding priorities until account runout is resolved.
				</div>
			{/if}
		{/if}

		<div
			role="button"
			tabindex="0"
			on:click={() => (plannerAdvancedOpenStage = 'stage3')}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					plannerAdvancedOpenStage = 'stage3';
				}
			}}
			class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${!stage3Reached ? 'border-slate-200 bg-slate-50 text-slate-500' : stage3Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
		>
			<div class="flex items-center gap-2">
				<span class="font-semibold">Stage 3: Safety</span>
				<InfoTooltip label="What is Stage 3 safety?">
					Stage 3 sets reserve minimums so essential spending is protected. This stage focuses on
					safety buffer and resilience.
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${!stage3Reached ? 'bg-slate-100 text-slate-500' : stage3Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
			>
				{!stage3Reached ? '?' : stage3Passed ? '✓' : '!'}
			</span>
		</div>
		{#if stage3Passed}
			<div class="mt-2 text-xs text-emerald-700">Your reserves and resilience are in a healthy range.</div>
		{/if}
		{#if stage3Reached && stage3Assessment}
			<div class="mt-3 space-y-2 text-xs text-sky-900">
				<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
					<div class="flex items-center gap-1">
						<span class="font-semibold">Safety Buffer Score</span>
						<InfoTooltip label="What is the Stage 3 safety buffer score?" theme="sky">
							Measures how many months you could survive on your liquid buffer given living expenses,
							asset ownership expenses and mortgage repayments. Current coverage is
							{Math.floor(stage3Assessment.safetyMonths)} months.
						</InfoTooltip>
					</div>
					<span class="font-semibold">{stage3Assessment.safetyScore}/100</span>
				</div>
				<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
					<div class="flex items-center gap-1">
						<span class="font-semibold">Resilience Score</span>
						<InfoTooltip label="What is the Stage 3 resilience score?" theme="sky">
							Measures the largest drop in liquidity over any rolling 12-month window in your
							projection. Worst window:
							{stage3Assessment.worstDrawdownStartDate
								? monthLabelFromDate(stage3Assessment.worstDrawdownStartDate)
								: 'N/A'} to {stage3Assessment.worstDrawdownEndDate
								? monthLabelFromDate(stage3Assessment.worstDrawdownEndDate)
								: 'N/A'}
							, drawdown: {stage3Assessment.worstDrawdownPct}%.
						</InfoTooltip>
					</div>
					<span class="font-semibold">{stage3Assessment.resilienceScore}/100</span>
				</div>
			</div>
		{/if}
		{#if stage3Reached && plannerAdvancedOpenStage === 'stage3' && !stage3Passed}
			<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
				<div class="font-semibold">Set Reserve Settings In What If</div>
				<div class="mt-1 text-xs">
					Use the Reserves tab in the What if?... section to set reserve amounts and funding source priorities.
				</div>
				<div class="mt-2 text-xs">
					Head down to the
					<a
						href="#what-if-panel"
						class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
						on:click|preventDefault={jumpToWhatIfReserves}
					>
						What if?...
					</a>
					section below to make your changes.
				</div>
			</div>
		{/if}

		<div
			role="button"
			tabindex="0"
			on:click={() => (plannerAdvancedOpenStage = 'stage4')}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					plannerAdvancedOpenStage = 'stage4';
				}
			}}
			class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${!stage4Reached ? 'border-slate-200 bg-slate-50 text-slate-500' : stage4Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
		>
			<div class="flex items-center gap-2">
				<span class="font-semibold">Stage 4: Growth Efficiency</span>
				<InfoTooltip label="What is Stage 4 growth efficiency?">
					Stage 4 sets cap and sweep settings so excess cash can move to growth assets while still
					respecting reserves. This stage focuses on growth allocation and goal match.
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${!stage4Reached ? 'bg-slate-100 text-slate-500' : stage4Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
			>
				{!stage4Reached ? '?' : stage4Passed ? '✓' : '!'}
			</span>
		</div>
		{#if stage4Passed}
			<div class="mt-2 text-xs text-emerald-700">Your cap settings support growth and match your horizon.</div>
		{/if}
		{#if stage3Reached && plannerAdvancedOpenStage === 'stage4'}
			{#if !stage4Reached}
				<div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
					Complete Stage 3 safety targets first to unlock Stage 4.
				</div>
			{:else}
				{#if stage3Assessment}
					<div class="mt-3 space-y-2 text-xs text-sky-900">
						<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
							<div class="flex items-center gap-1">
								<span class="font-semibold">Growth Allocation Score</span>
								<InfoTooltip label="What is the Stage 4 growth allocation score?" theme="sky">
									Shows how much of current value is in growth assets (shares, super, property) versus
									defensive cash. Current growth allocation is {stage3Assessment.growthAllocationPct}%.
								</InfoTooltip>
							</div>
							<span class="font-semibold">{stage3Assessment.growthScore}/100</span>
						</div>
						<div class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1">
							<div class="flex items-center gap-1">
								<span class="font-semibold">Goal Match Score</span>
								<InfoTooltip label="What is the Stage 4 goal match score?" theme="sky">
									Checks whether growth allocation fits your projection horizon. Current horizon is
									{stage3Assessment.horizonMonths} months.
								</InfoTooltip>
							</div>
							<span class="font-semibold">{stage3Assessment.goalMatchScore}/100</span>
						</div>
						<div class="text-[11px] text-sky-800">
							Current profile: {stage3Assessment.profile} ({stage3Assessment.totalScore}/100).
						</div>
					</div>
				{/if}
				{#if !stage4Passed}
					<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
						<div class="font-semibold">Set Cap Settings In What If</div>
						<div class="mt-1 text-xs">
							Use the Caps tab in the What if?... section to set cap amounts and funding destination
							priorities.
						</div>
						<div class="mt-2 text-xs">
							Head down to the
							<a
								href="#what-if-panel"
								class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
								on:click|preventDefault={jumpToWhatIfCaps}
							>
								What if?...
							</a>
							section below to make your changes.
						</div>
					</div>
				{/if}
			{/if}
		{/if}
		{#if isInitialProjectionLoading}
			<div class="absolute inset-0 z-20 rounded-2xl bg-white/85 p-4">
				<div class="animate-pulse space-y-3">
					<div class="h-4 w-40 rounded bg-slate-200"></div>
					<div class="h-14 w-full rounded-xl bg-slate-100"></div>
					<div class="h-14 w-full rounded-xl bg-slate-100"></div>
					<div class="h-14 w-full rounded-xl bg-slate-100"></div>
				</div>
			</div>
		{/if}
	</div>
	{#if (projectionEvents?.length ?? 0) > 0}
		<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<h3 class="text-sm font-semibold text-slate-900">Events</h3>
			<div class="mt-3 space-y-2">
				{#each projectionEvents as event}
					<div
						class={`rounded-lg border px-3 py-2 text-xs ${
							event.tone === 'negative'
								? 'border-rose-200 bg-rose-50 text-rose-700'
								: 'border-emerald-200 bg-emerald-50 text-emerald-700'
						}`}
					>
						{event.monthLabel ? `${event.monthLabel}: ${event.message}` : event.message}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>


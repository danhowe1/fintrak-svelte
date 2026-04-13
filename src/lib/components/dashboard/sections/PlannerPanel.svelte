<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';

	export let stage1Passed: boolean;
	export let plannerStage: string;
	export let stage1PlannerMessage: string;
	export let jumpToWhatIfAssetsExpense: () => void;
	export let jumpToWhatIfAddAsset: () => void;
	export let jumpToWhatIfLivingExpenses: () => void;
	export let jumpToWhatIfIncome: () => void;
	export let jumpToWhatIfRetirementAge: () => void;
	export let showEmploymentIncomeShortcut: boolean;
	export let jumpToWhatIfEmploymentIncome: () => void;
	export let showInterestRateShortcut: boolean;
	export let jumpToWhatIfInterestRates: () => void;
	export let showInvestmentPropertyShortcut: boolean;
	export let jumpToWhatIfInvestmentPropertySale: () => void;
	export let showPrimaryResidenceShortcut: boolean;
	export let jumpToWhatIfPrimaryResidenceSale: () => void;

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
		<h3 class="app-title-sm">Funding Planner</h3>
		<div
			class={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${stage1Passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
		>
			<div class="flex items-center gap-2">
				<span class="font-semibold">Stage 1: Liquidity</span>
				<InfoTooltip label="What is Stage 1 liquidity?">
					Stage 1 checks whether you are living within your means by seeing if you run out of
					accessible money in any month. Accessible money is in either cash accounts, shares or
					pension/superannuation funds (if available).
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${stage1Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
			>
				{stage1Passed ? '✓' : '✕'}
			</span>
		</div>
		{#if stage1Passed}
			<StatusMessage tone="success" class="mt-2 border-0 bg-transparent px-0 py-0 text-emerald-700">
				You are living within your means.
			</StatusMessage>
		{/if}
		{#if plannerStage === 'liquidity'}
			<StatusMessage tone="warning" class="mt-3">
				{stage1PlannerMessage}
			</StatusMessage>
			<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
				<div class="font-semibold">Fix Liquidity First</div>
				<div class="mt-1 text-xs">
					You need to reduce your expenses or increase your income to ensure your liquidity.
				</div>
				<div class="mt-3 text-xs font-semibold">Ways you can fix your liquidity:</div>
				<ul class="mt-2 list-disc pl-5 text-xs">
					<li>
						<button
							type="button"
							class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
							style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
							onclick={jumpToWhatIfAddAsset}
						>
							Add an income generating asset.
						</button>
					</li>
					<li>
						<button
							type="button"
							class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
							style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
							onclick={jumpToWhatIfLivingExpenses}
						>
							Reduce or remove expenses.
						</button>
					</li>
					{#if showEmploymentIncomeShortcut}
						<li>
							<button
								type="button"
								class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
								style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
								onclick={jumpToWhatIfEmploymentIncome}
							>
								Increase employment income.
							</button>
						</li>
					{/if}
					<li>
						<button
							type="button"
							class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
							style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
							onclick={jumpToWhatIfIncome}
						>
							Sell something or generate new income.
						</button>
					</li>
					<li>
						<button
							type="button"
							class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
							style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
							onclick={jumpToWhatIfRetirementAge}
						>
							Keep working for longer.
						</button>
					</li>
					{#if showInterestRateShortcut}
						<li>
							<button
								type="button"
								class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
								style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
								onclick={jumpToWhatIfInterestRates}
							>
								Nogotiate better interest rates.
							</button>
						</li>
					{/if}
					{#if showInvestmentPropertyShortcut}
						<li>
							<button
								type="button"
								class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
								style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
								onclick={jumpToWhatIfInvestmentPropertySale}
							>
								Sell an investment property.
							</button>
						</li>
					{/if}
					{#if showPrimaryResidenceShortcut}
						<li>
							<button
								type="button"
								class="appearance-none cursor-pointer border-0 bg-transparent p-0 text-left text-current hover:text-amber-950"
							style="font: inherit; font-weight: 400; text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.9); text-underline-offset: 2px;"
							onclick={jumpToWhatIfPrimaryResidenceSale}
						>
							Sell your home.
						</button>
					</li>
					{/if}
				</ul>
				<div class="mt-2 text-xs">
					Head down to the
					<a
						href="#what-if-panel"
						class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
						onclick={(event) => {
							event.preventDefault();
							void jumpToWhatIfAssetsExpense();
						}}
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
					remain in the black. Stage 2 is about ensuring you have access to funds when you need
					them.
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${!stage2Reached ? 'bg-slate-100 text-slate-500' : stage2Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
			>
				{!stage2Reached ? '?' : stage2Passed ? '✓' : '✕'}
			</span>
		</div>
		{#if stage2Passed}
			<StatusMessage tone="success" class="mt-2 border-0 bg-transparent px-0 py-0 text-emerald-700">
				None of your accounts run out of money.
			</StatusMessage>
		{/if}
		{#if stage2Reached && !stage2Passed}
			<StatusMessage tone="warning" class="mt-3">
				{stage2PlannerMessage}
			</StatusMessage>
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
									<Button
										type="button"
										variant="secondary"
										size="2xs"
										onclick={() => removeAutoFundingRule(rule.id)}
									>
										Remove
									</Button>
								</div>
							{/each}
						</div>
					{/if}
					<div class="app-hint mt-2 block">
						<select
							class="app-input-compact app-input-compact-lg w-full"
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
						<div
							class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
						>
							{plannerSourceAvailabilityWarning}
						</div>
					{/if}
					<div class="mt-2">
						<Button
							type="button"
							variant="secondary"
							size="xs"
							disabled={!plannerSourceAccountId || plannerSourceOptions.length === 0}
							onclick={saveAutoFundingRule}
						>
							Add Funding Account
						</Button>
					</div>
					{#if autoFundingRuleError}
						<StatusMessage tone="error" class="mt-2">{autoFundingRuleError}</StatusMessage>
					{/if}
				</div>
			{:else}
				<StatusMessage tone="info" class="mt-3 border-slate-200 bg-slate-50 text-slate-700">
					Stage 2 is active. Review auto-funding priorities until account runout is resolved.
				</StatusMessage>
			{/if}
		{/if}

		<div
			role="button"
			tabindex="0"
			onclick={() => (plannerAdvancedOpenStage = 'stage3')}
			onkeydown={(event) => {
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
			<StatusMessage tone="success" class="mt-2 border-0 bg-transparent px-0 py-0 text-emerald-700">
				Your reserves and resilience are in a healthy range.
			</StatusMessage>
		{/if}
		{#if stage3Reached && stage3Assessment}
			<div class="mt-3 space-y-2 text-xs text-sky-900">
				<div
					class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1"
				>
						<div class="flex items-center gap-1">
							<span class="font-semibold">Safety Buffer Score</span>
							<InfoTooltip label="What is the Stage 3 safety buffer score?" theme="sky">
								Measures how many months you could cover essential costs from your total liquid
								cash buffer. Current coverage is
								{Math.floor(stage3Assessment.safetyMonths)} months.
								<br /><br />
								This is measured so you can see whether you have enough accessible cash to absorb
								expenses and short-term shocks without needing to sell growth assets too soon.
								<br /><br />
								It is worked out by taking your total accessible cash and dividing it by your
								average monthly essential costs. For example, if you have $60,000 in liquid cash and
								essential costs are $10,000 a month, that gives 6 months of cover. The score then
								rises as coverage improves, with stronger scores from 6 months and highest scores
								at 12 months or more.
							</InfoTooltip>
						</div>
					<span class="font-semibold">{stage3Assessment.safetyScore}/100</span>
				</div>
				<div
					class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1"
				>
						<div class="flex items-center gap-1">
							<span class="font-semibold">Resilience Score</span>
							<InfoTooltip label="What is the Stage 3 resilience score?" theme="sky">
								Measures the largest drop in liquidity over any rolling 12-month window in your
								projection.
								{#if stage3Assessment.worstDrawdownPct > 0 &&
									stage3Assessment.worstDrawdownStartDate &&
									stage3Assessment.worstDrawdownEndDate}
									Worst window:
									{monthLabelFromDate(stage3Assessment.worstDrawdownStartDate)} to
									{monthLabelFromDate(stage3Assessment.worstDrawdownEndDate)}, drawdown:
									{stage3Assessment.worstDrawdownPct}%.
								{:else}
									No liquidity drawdown was detected in the projection.
								{/if}
								<br /><br />
								This is measured so you can see how sharply cash availability may fall during
								stress periods, even if you do not fully run out of money.
								<br /><br />
								It is worked out by scanning each 12-month period, finding the biggest percentage
								fall in liquidity, and scoring that drop. A smaller drop gives a higher score. For
								example, a 10% drop scores much better than a 40% drop, because the plan is staying
								more stable through tough periods.
							</InfoTooltip>
						</div>
					<span class="font-semibold">{stage3Assessment.resilienceScore}/100</span>
				</div>
			</div>
		{/if}
		{#if stage3Reached && !stage3Passed}
			<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
				<div class="font-semibold">Set Reserve Settings In What If</div>
				<div class="mt-1 text-xs">
					You don't have a safe level of cash reserves. If possible, increase reserve amounts and set funding source
					priorities.
				</div>
				<div class="mt-2 text-xs">
					Head down to the
					<a
						href="#what-if-panel"
						class="font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
						onclick={(event) => {
							event.preventDefault();
							void jumpToWhatIfReserves();
						}}
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
			onclick={() => (plannerAdvancedOpenStage = 'stage4')}
			onkeydown={(event) => {
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
					respecting reserves. This stage focuses on growth allocation and horizon fit.
				</InfoTooltip>
			</div>
			<span
				class={`rounded-full px-2 py-0.5 font-semibold ${!stage4Reached ? 'bg-slate-100 text-slate-500' : stage4Passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
			>
				{!stage4Reached ? '?' : stage4Passed ? '✓' : '!'}
			</span>
		</div>
		{#if stage4Passed}
			<StatusMessage tone="success" class="mt-2 border-0 bg-transparent px-0 py-0 text-emerald-700">
				Your cap settings support growth and fit your scenario horizon.
			</StatusMessage>
		{/if}
		{#if stage3Reached && plannerAdvancedOpenStage === 'stage4'}
			{#if stage4Reached}
				{#if stage3Assessment}
					<div class="mt-3 space-y-2 text-xs text-sky-900">
						<div
							class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1"
						>
								<div class="flex items-center gap-1">
									<span class="font-semibold">Growth Allocation Score</span>
									<InfoTooltip label="What is the Stage 4 growth allocation score?" theme="sky">
										Measures how much of your current value is held in growth assets
										(shares, super, investment properties) versus defensive cash. Current growth
										allocation is {Math.round(stage3Assessment.growthAllocationPct)}%.
										<br /><br />
										This is measured so you can see whether excess cash is being put to work for
										longer-term growth instead of sitting too heavily in defensive holdings.
										<br /><br />
										It is worked out by dividing growth assets by total growth plus defensive cash.
										For example, if you have $300,000 in growth assets and $200,000 in cash, your
										growth allocation is 60%. The score rises as more of the portfolio is allocated
										to growth, with the strongest scores around 70% or higher.
									</InfoTooltip>
								</div>
							<span class="font-semibold">{stage3Assessment.growthScore}/100</span>
						</div>
							<div
								class="flex items-center justify-between gap-2 rounded border border-sky-200/70 bg-white/70 px-2 py-1"
							>
									<div class="flex items-center gap-1">
										<span class="font-semibold">Horizon Fit Score</span>
									<InfoTooltip label="What is the Stage 4 horizon fit score?" theme="sky">
										Measures whether your current growth allocation suits your full scenario
										projection horizon. Current full-scenario horizon is
										{stage3Assessment.horizonMonths} months.
										<br /><br />
										This is measured so you can see whether your portfolio is positioned
										appropriately for when the money is likely to be needed. Too much cash over a
										long horizon can limit growth, while too much in growth assets when funds are
										needed sooner can add risk.
										<br /><br />
										It is worked out by comparing your current growth allocation with a target for
										the scenario horizon. Shorter horizons target less growth, longer horizons
										target more. In this planner the target is 40% up to 5 years, 60% up to 10
										years, and 75% beyond that. The closer your allocation is to the target, the
										higher the score.
									</InfoTooltip>
									</div>
								<span class="font-semibold">{stage3Assessment.goalMatchScore}/100</span>
							</div>
							<div
								class="rounded-lg border border-sky-300 bg-sky-50/80 px-3 py-2 text-sm text-sky-900"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-1">
										<span class="font-semibold">Total Financial Health Score</span>
										<InfoTooltip
											label="What is the total financial health score?"
											theme="sky"
											align="right"
										>
											Measures your overall planner position by combining the safety buffer,
											resilience, growth allocation and horizon fit scores. Current profile is
											{stage3Assessment.profile}.
											<br /><br />
											This is measured so you can quickly see the overall shape of the plan rather
											than needing to interpret each score separately.
											<br /><br />
											It is worked out as a weighted blend of the other planner scores: safety
											buffer 35%, growth allocation 35%, resilience 20%, and horizon fit 10%.
											The combined result is then grouped into a profile: Conservative for lower
											scores, Balanced for mid-range scores, and Growth for higher scores.
										</InfoTooltip>
									</div>
									<span class="font-semibold">{stage3Assessment.totalScore}/100</span>
								</div>
								<div class="mt-1 text-[11px] text-sky-800">
									Current profile: {stage3Assessment.profile}.
								</div>
							</div>
						</div>
				{/if}
				{#if !stage4Passed}
					<div
						class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
					>
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
								onclick={(event) => {
									event.preventDefault();
									void jumpToWhatIfCaps();
								}}
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
			<h3 class="app-title-sm">Events</h3>
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

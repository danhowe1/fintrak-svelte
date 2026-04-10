<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import type { AssetPanelTab } from '$lib/dashboard/types';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import PendingNavLink from '$lib/components/ui/PendingNavLink.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';
	import AssetsTab from '$lib/components/dashboard/tabs/AssetsTab.svelte';
	import AccountsTab from '$lib/components/dashboard/tabs/AccountsTab.svelte';
	import TransfersTab from '$lib/components/dashboard/tabs/TransfersTab.svelte';
	import ReservesTab from '$lib/components/dashboard/tabs/ReservesTab.svelte';
	import CapsTab from '$lib/components/dashboard/tabs/CapsTab.svelte';

	export let whatIfPanelElement: HTMLElement | null = null;
	export let assetPanelTab: AssetPanelTab;
	export let isAddAssetMenuOpen = false;
	export let isInitialWhatIfLoading: boolean;
	export let whatIfLoadError: string | null;

	export let assetsTabProps: ComponentProps<typeof AssetsTab>;
	export let accountsTabProps: ComponentProps<typeof AccountsTab>;
	export let transfersTabProps: ComponentProps<typeof TransfersTab>;
	export let reservesTabProps: ComponentProps<typeof ReservesTab>;
	export let capsTabProps: ComponentProps<typeof CapsTab>;

	const assetTabOptions = [
		{ value: 'assets', label: 'Assets' },
		{ value: 'accounts', label: 'Accounts' },
		{ value: 'transfers', label: 'Transfers' },
		{ value: 'reserves', label: 'Reserves' },
		{ value: 'caps', label: 'Caps' }
	];

	const hasPropertyAsset = () =>
		assetsTabProps.data.assetsList.some((asset) => asset.asset_type === 'property');
</script>

<div id="what-if-panel" bind:this={whatIfPanelElement} class="app-panel relative">
	<div class="flex items-center gap-2">
		<h3 class="app-title-lg">What if?...</h3>
		<span class="group relative inline-flex">
			<button
				type="button"
				class="grid h-4 w-4 place-items-center rounded-full border border-slate-900/30 bg-white text-[10px] leading-none font-bold text-slate-900"
				aria-label="What is the What if section for?"
			>
				i
			</button>
			<span
				role="tooltip"
				class="pointer-events-none absolute top-full left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900 opacity-0 shadow-md transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
			>
				Use this area to play out your 'what if?' scenarios. What if?...
				<ul class="mt-1 list-disc pl-4">
					<li>You retire early?</li>
					<li>Interest rates go up?</li>
					<li>Etc...</li>
				</ul>
			</span>
		</span>
	</div>
	<div class="mt-3 flex flex-wrap items-start justify-between gap-2">
		<SegmentedControl
			class="text-xs font-semibold"
			options={assetTabOptions}
			value={assetPanelTab}
			onChange={(next) =>
				(assetPanelTab = next as 'assets' | 'accounts' | 'transfers' | 'reserves' | 'caps')}
		/>
		{#if assetPanelTab === 'assets'}
			<details class="relative" bind:open={isAddAssetMenuOpen}>
				<summary class="app-btn-primary-xs flex cursor-pointer items-center gap-2 list-none">
					<span>Add asset...</span>
					<span aria-hidden="true" class="text-[10px]">▼</span>
				</summary>
				<div
					class="absolute top-full right-0 z-10 mt-2 min-w-[13rem] rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
				>
					<div class="flex flex-col gap-2">
						<PendingNavLink
							href="/assets/person/create"
							class="app-btn-primary-xs justify-center"
						>
							Add person
						</PendingNavLink>
						<PendingNavLink
							href="/assets/property/create"
							class="app-btn-primary-xs justify-center"
						>
							Add property
						</PendingNavLink>
						{#if hasPropertyAsset()}
							<PendingNavLink
								href="/assets/mortgage/create"
								class="app-btn-primary-xs justify-center"
							>
								Add mortgage
							</PendingNavLink>
						{/if}
						<PendingNavLink
							href="/assets/superannuation/create"
							class="app-btn-primary-xs justify-center"
						>
							Add superannuation
						</PendingNavLink>
						<PendingNavLink
							href="/assets/shares/create"
							class="app-btn-primary-xs justify-center"
						>
							Add shares
						</PendingNavLink>
					</div>
				</div>
			</details>
		{:else if assetPanelTab === 'accounts'}
			<PendingNavLink href="/accounts/create" class="app-btn-primary-xs">
				Add account
			</PendingNavLink>
		{/if}
	</div>
	{#if !isInitialWhatIfLoading}
		{#if assetPanelTab === 'assets'}
			<AssetsTab
				data={assetsTabProps.data}
				person={assetsTabProps.person}
				cashflow={assetsTabProps.cashflow}
				share={assetsTabProps.share}
				super={assetsTabProps.super}
				property={assetsTabProps.property}
				mortgage={assetsTabProps.mortgage}
				ui={assetsTabProps.ui}
			/>
		{:else if assetPanelTab === 'accounts'}
			<AccountsTab
				data={accountsTabProps.data}
				actions={accountsTabProps.actions}
				ui={accountsTabProps.ui}
			/>
		{:else if assetPanelTab === 'transfers'}
			<TransfersTab
				data={transfersTabProps.data}
				handlers={transfersTabProps.handlers}
				ui={transfersTabProps.ui}
			/>
		{:else if assetPanelTab === 'reserves'}
			<ReservesTab
				data={reservesTabProps.data}
				actions={reservesTabProps.actions}
				ui={reservesTabProps.ui}
			/>
		{:else if assetPanelTab === 'caps'}
			<CapsTab data={capsTabProps.data} actions={capsTabProps.actions} ui={capsTabProps.ui} />
		{/if}
	{/if}
	{#if whatIfLoadError}
		<StatusMessage tone="error" class="mt-4">
			{whatIfLoadError}
		</StatusMessage>
	{/if}
	{#if isInitialWhatIfLoading}
		<div class="absolute inset-0 z-20 rounded-2xl bg-white/85 p-6">
			<div class="animate-pulse space-y-4">
				<div class="h-5 w-40 rounded bg-slate-200"></div>
				<div class="h-8 w-96 max-w-full rounded-full bg-slate-100"></div>
				<div class="h-56 w-full rounded-xl bg-slate-100"></div>
			</div>
		</div>
	{/if}
</div>

<style>
	details > summary::-webkit-details-marker {
		display: none;
	}

	details > summary {
		list-style: none;
	}
</style>

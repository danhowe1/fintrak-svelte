<script lang="ts">
	import DisclosureToggle from '$lib/components/ui/DisclosureToggle.svelte';
	import type { AssetListItem, AssetsTabShareProps, AssetsTabUiProps } from './types';

	let {
		asset,
		share,
		ui,
		isValidMonthYear,
		assetsList,
		setAssetsList,
		requestDeleteAsset
	}: {
		asset: AssetListItem;
		share: AssetsTabShareProps;
		ui: AssetsTabUiProps;
		isValidMonthYear: (value: string) => boolean;
		assetsList: AssetListItem[];
		setAssetsList: (next: AssetListItem[]) => void;
		requestDeleteAsset: (id: string, name: string) => void;
	} = $props();

	const shareDetails = $derived(share.shareDetails);
	const shareErrors = $derived(share.shareErrors);
	const expandedShareDetailIds = $derived(share.expandedShareDetailIds);
	const toggleShareDetails = $derived(share.toggleShareDetails);
	const setShareDetails = $derived(share.setShareDetails);
	const setShareError = $derived(share.setShareError);
	const updateShareDetails = $derived(share.updateShareDetails);

	// svelte-ignore state_referenced_locally
	let { stepForValue, scheduleUpdate, formatRate } = ui;

	const roundToOne = (value: number) => Math.round(value * 10) / 10;
</script>

<div class="app-card-muted w-full">
	<div class="flex items-center justify-between gap-2">
		<h3 class="app-title-sm truncate">
			{shareDetails[asset.id]?.name ?? asset.name}
		</h3>
		<button
			type="button"
			class="text-xs font-semibold text-rose-600 hover:text-rose-700"
			onclick={() => requestDeleteAsset(asset.id, shareDetails[asset.id]?.name ?? asset.name)}
		>
			Delete
		</button>
	</div>
	<div class="app-hint mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1">
		<span class="truncate text-slate-500">Capital growth rate</span>
		<div class="flex flex-col items-end justify-self-end">
			<input
				type="number"
				class="app-input-compact app-input-compact-lg w-24"
				value={formatRate(shareDetails[asset.id]?.capitalGrowthRate ?? 0, 1)}
				step="0.1"
				oninput={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const current = shareDetails[asset.id];
					if (!current) return;
					setShareDetails(asset.id, {
						...current,
						capitalGrowthRate: Number.isFinite(next) ? roundToOne(next) : 0
					});
				}}
				onchange={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const current = shareDetails[asset.id];
					if (!current) return;
					if (!Number.isFinite(next)) {
						setShareError(asset.id, 'capitalGrowthRate', 'Use a valid number.');
						return;
					}
					setShareError(asset.id, 'capitalGrowthRate', '');
					setShareDetails(asset.id, { ...current, capitalGrowthRate: roundToOne(next) });
					scheduleUpdate(`shares:${asset.id}`, () =>
						updateShareDetails(
							asset.id,
							current.name,
							current.startDate,
							roundToOne(next),
							current.dividendYield,
							current.dividendsTakenAsIncomeDate
						)
					);
				}}
			/>
			{#if shareErrors[asset.id]?.capitalGrowthRate}
				<span class="mt-1 text-[10px] text-rose-600">
					{shareErrors[asset.id]?.capitalGrowthRate}
				</span>
			{/if}
		</div>
		<span></span>
	</div>
	<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
		<span class="truncate text-slate-500">Dividend yield</span>
		<div class="flex flex-col items-end justify-self-end">
			<input
				type="number"
				class="app-input-compact app-input-compact-lg w-24"
				value={formatRate(shareDetails[asset.id]?.dividendYield ?? 0, 1)}
				step="0.1"
				oninput={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const current = shareDetails[asset.id];
					if (!current) return;
					setShareDetails(asset.id, {
						...current,
						dividendYield: Number.isFinite(next) ? roundToOne(next) : 0
					});
				}}
				onchange={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const current = shareDetails[asset.id];
					if (!current) return;
					if (!Number.isFinite(next)) {
						setShareError(asset.id, 'dividendYield', 'Use a valid number.');
						return;
					}
					setShareError(asset.id, 'dividendYield', '');
					setShareDetails(asset.id, { ...current, dividendYield: roundToOne(next) });
					scheduleUpdate(`shares:${asset.id}`, () =>
						updateShareDetails(
							asset.id,
							current.name,
							current.startDate,
							current.capitalGrowthRate,
							roundToOne(next),
							current.dividendsTakenAsIncomeDate
						)
					);
				}}
			/>
			{#if shareErrors[asset.id]?.dividendYield}
				<span class="mt-1 text-[10px] text-rose-600">
					{shareErrors[asset.id]?.dividendYield}
				</span>
			{/if}
		</div>
		<span></span>
	</div>
	<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
		<span class="truncate text-slate-500">Dividends taken as income</span>
		<div class="flex flex-col items-end justify-self-end">
			<input
				type="text"
				inputmode="numeric"
				pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
				class="app-input-compact app-input-compact-lg w-24"
				value={shareDetails[asset.id]?.dividendsTakenAsIncomeDate ?? ''}
				oninput={(event) => {
					const next = (event.currentTarget as HTMLInputElement).value;
					const current = shareDetails[asset.id];
					if (!current) return;
					setShareDetails(asset.id, { ...current, dividendsTakenAsIncomeDate: next });
					if (next.trim().length === 0 || isValidMonthYear(next)) {
						setShareError(asset.id, 'dividendsTakenAsIncomeDate', '');
					}
				}}
				onchange={(event) => {
					const next = (event.currentTarget as HTMLInputElement).value;
					const current = shareDetails[asset.id];
					if (!current) return;
					if (next.trim().length === 0 || !isValidMonthYear(next)) {
						setShareError(asset.id, 'dividendsTakenAsIncomeDate', 'Use MM YYYY format.');
						return;
					}
					setShareError(asset.id, 'dividendsTakenAsIncomeDate', '');
					setShareDetails(asset.id, { ...current, dividendsTakenAsIncomeDate: next });
					scheduleUpdate(`shares:${asset.id}`, () =>
						updateShareDetails(
							asset.id,
							current.name,
							current.startDate,
							current.capitalGrowthRate,
							current.dividendYield,
							next
						)
					);
				}}
			/>
			{#if shareErrors[asset.id]?.dividendsTakenAsIncomeDate}
				<span class="mt-1 text-[10px] text-rose-600">
					{shareErrors[asset.id]?.dividendsTakenAsIncomeDate}
				</span>
			{/if}
		</div>
		<DisclosureToggle
			expanded={expandedShareDetailIds.has(asset.id)}
			onToggle={() => toggleShareDetails(asset.id)}
		/>
	</div>
	{#if expandedShareDetailIds.has(asset.id)}
		<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
			<span class="truncate text-slate-500">Start date (MM YYYY)</span>
			<div class="flex flex-col items-end justify-self-end">
				<input
					type="text"
					inputmode="numeric"
					pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
					class="app-input-compact app-input-compact-lg w-24"
					value={shareDetails[asset.id]?.startDate ?? ''}
					oninput={(event) => {
						const next = (event.currentTarget as HTMLInputElement).value;
						const current = shareDetails[asset.id];
						if (!current) return;
						setShareDetails(asset.id, { ...current, startDate: next });
						if (next.trim().length === 0 || isValidMonthYear(next)) {
							setShareError(asset.id, 'startDate', '');
						}
					}}
					onchange={(event) => {
						const next = (event.currentTarget as HTMLInputElement).value;
						const current = shareDetails[asset.id];
						if (!current) return;
						if (next.trim().length === 0 || !isValidMonthYear(next)) {
							setShareError(asset.id, 'startDate', 'Use MM YYYY format.');
							return;
						}
						if (!current.name.trim()) {
							setShareError(asset.id, 'name', 'Name is required.');
							return;
						}
						if (
							current.dividendsTakenAsIncomeDate.trim().length === 0 ||
							!isValidMonthYear(current.dividendsTakenAsIncomeDate)
						) {
							setShareError(asset.id, 'dividendsTakenAsIncomeDate', 'Use MM YYYY format.');
							return;
						}
						setShareError(asset.id, 'startDate', '');
						setShareDetails(asset.id, { ...current, startDate: next });
						scheduleUpdate(`shares:${asset.id}`, () =>
							updateShareDetails(
								asset.id,
								current.name,
								next,
								current.capitalGrowthRate,
								current.dividendYield,
								current.dividendsTakenAsIncomeDate
							)
						);
					}}
				/>
				{#if shareErrors[asset.id]?.startDate}
					<span class="mt-1 text-[10px] text-rose-600">{shareErrors[asset.id]?.startDate}</span>
				{/if}
			</div>
			<span></span>
		</div>
		<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
			<span class="truncate text-slate-500">Name</span>
			<div class="flex flex-col items-end justify-self-end">
				<input
					type="text"
					class="app-input-compact app-input-compact-lg w-24"
					value={shareDetails[asset.id]?.name ?? asset.name}
					oninput={(event) => {
						const next = (event.currentTarget as HTMLInputElement).value;
						const current = shareDetails[asset.id];
						if (!current) return;
						setShareDetails(asset.id, { ...current, name: next });
						if (next.trim().length > 0) {
							setShareError(asset.id, 'name', '');
						}
					}}
					onchange={(event) => {
						const next = (event.currentTarget as HTMLInputElement).value.trim();
						const current = shareDetails[asset.id];
						if (!current) return;
						if (!next) {
							setShareError(asset.id, 'name', 'Name is required.');
							return;
						}
						if (
							current.startDate.trim().length === 0 ||
							!isValidMonthYear(current.startDate)
						) {
							setShareError(asset.id, 'startDate', 'Use MM YYYY format.');
							return;
						}
						if (
							current.dividendsTakenAsIncomeDate.trim().length === 0 ||
							!isValidMonthYear(current.dividendsTakenAsIncomeDate)
						) {
							setShareError(asset.id, 'dividendsTakenAsIncomeDate', 'Use MM YYYY format.');
							return;
						}
						setShareError(asset.id, 'name', '');
						setShareDetails(asset.id, { ...current, name: next });
						setAssetsList(assetsList.map((a) => (a.id === asset.id ? { ...a, name: next } : a)));
						scheduleUpdate(`shares:${asset.id}`, () =>
							updateShareDetails(
								asset.id,
								next,
								current.startDate,
								current.capitalGrowthRate,
								current.dividendYield,
								current.dividendsTakenAsIncomeDate
							)
						);
					}}
				/>
				{#if shareErrors[asset.id]?.name}
					<span class="mt-1 text-[10px] text-rose-600">{shareErrors[asset.id]?.name}</span>
				{/if}
			</div>
			<span></span>
		</div>
	{/if}
</div>

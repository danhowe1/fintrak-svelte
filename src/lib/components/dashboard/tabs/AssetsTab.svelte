<script lang="ts">
	import PersonCard from './PersonCard.svelte';
	import ShareCard from './ShareCard.svelte';
	import PropertyCard from './PropertyCard.svelte';
	import type { AssetsTabProps } from './types';

	let {
		data,
		person,
		cashflow,
		share,
		super: superannuation,
		property,
		mortgage,
		ui
	}: AssetsTabProps = $props();

	let assetsList = $state<typeof data.assetsList>([]);
	let accountsList = $state<typeof data.accountsList>([]);
	let assetsCardsElement: HTMLElement | null = null;

	const applyLabelTitles = () => {
		if (!assetsCardsElement) return;
		const labels = assetsCardsElement.querySelectorAll<HTMLElement>('.truncate.text-slate-500');
		for (const label of labels) {
			const text = label.textContent?.trim() ?? '';
			if (text.length === 0) continue;
			const isTruncated = label.scrollWidth > label.clientWidth + 1;
			if (isTruncated) {
				label.title = text;
				label.dataset.fullLabel = text;
			} else {
				label.removeAttribute('title');
				delete label.dataset.fullLabel;
			}
		}
	};

	let assetAccountsList = $derived.by(() => data.assetAccountsList);

	$effect(() => {
		assetsList = data.assetsList;
		accountsList = data.accountsList;
	});

	$effect(() => {
		if (!assetsCardsElement) return;
		applyLabelTitles();
		const observer = new MutationObserver(() => applyLabelTitles());
		observer.observe(assetsCardsElement, {
			subtree: true,
			childList: true,
			characterData: true
		});
		const resizeObserver = new ResizeObserver(() => applyLabelTitles());
		resizeObserver.observe(assetsCardsElement);
		return () => {
			observer.disconnect();
			resizeObserver.disconnect();
		};
	});

	const isValidMonthYear = $derived(person.isValidMonthYear);
	const requestDeleteAsset = $derived(data.requestDeleteAsset);
</script>

<div
	bind:this={assetsCardsElement}
	class="assets-cards mt-5 grid gap-3 p-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
>
	{#each assetsList.filter((a) => a.asset_type === 'person') as personAsset (personAsset.id)}
		<PersonCard
			asset={personAsset}
			{person}
			{cashflow}
			{superannuation}
			{ui}
			{assetsList}
			setAssetsList={(next) => { assetsList = next; }}
			{requestDeleteAsset}
		/>
	{/each}
	{#each assetsList.filter((a) => a.asset_type === 'shares') as shareAsset (shareAsset.id)}
		<ShareCard
			asset={shareAsset}
			{share}
			{ui}
			{isValidMonthYear}
			{assetsList}
			setAssetsList={(next) => { assetsList = next; }}
			{requestDeleteAsset}
		/>
	{/each}
	{#each assetsList.filter((a) => a.asset_type === 'property') as propertyAsset (propertyAsset.id)}
		<PropertyCard
			asset={propertyAsset}
			{property}
			{mortgage}
			{cashflow}
			{ui}
			{assetsList}
			setAssetsList={(next) => { assetsList = next; }}
			{accountsList}
			setAccountsList={(next) => { accountsList = next; }}
			{assetAccountsList}
			{isValidMonthYear}
			{requestDeleteAsset}
		/>
	{/each}
</div>

<style>
	.assets-cards :global(input) {
		font-size: 0.75rem;
		line-height: 1rem;
	}

	.assets-cards :global(.grid-cols-\[140px_100px_32px\]) {
		grid-template-columns: minmax(0, 1fr) minmax(0, 6rem) 2rem;
	}

	.assets-cards :global(.w-24) {
		width: 100%;
		max-width: 6rem;
		min-width: 0;
	}

	.assets-cards :global(input),
	.assets-cards :global(select) {
		min-width: 0;
		max-width: 100%;
	}

	.assets-cards :global(.truncate.text-slate-500[data-full-label]) {
		position: relative;
		cursor: help;
	}

	.assets-cards :global(.truncate.text-slate-500[data-full-label]:hover::after),
	.assets-cards :global(.truncate.text-slate-500[data-full-label]:focus-visible::after) {
		content: attr(data-full-label);
		position: absolute;
		left: 0;
		bottom: calc(100% + 6px);
		z-index: 20;
		max-width: min(18rem, 80vw);
		padding: 0.35rem 0.5rem;
		border-radius: 0.375rem;
		background: rgb(15 23 42);
		color: white;
		font-size: 0.7rem;
		line-height: 1rem;
		font-weight: 500;
		white-space: normal;
		overflow-wrap: anywhere;
		box-shadow: 0 6px 20px rgb(15 23 42 / 0.25);
	}

	@media (max-width: 420px) {
		.assets-cards :global(.grid-cols-\[140px_100px_32px\]) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 5.25rem) 2rem;
		}
	}
</style>

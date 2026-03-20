<script lang="ts">
	import type { PageData } from './$types';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data: PageData;

	const now = new Date();
	const defaultMonth = (() => {
		const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const year = firstOfMonth.getFullYear();
		const month = String(firstOfMonth.getMonth() + 1).padStart(2, '0');
		return `${month} ${year}`;
	})();

	const formatMonth = (value?: string) => {
		if (!value) return '—';
		const normalized =
			value.length === 7 ? `${value}-01` : value.length >= 10 ? value.slice(0, 10) : value;
		const date = new Date(value.length >= 10 ? value : `${normalized}T00:00:00`);
		if (Number.isNaN(date.getTime())) return '—';
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const year = date.getFullYear();
		return `${month} ${year}`;
	};

	const formatLabel = (value: string) =>
		value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const formatRelationships = (
		relationships: { accountName: string; role: string }[] | undefined
	) => {
		if (!relationships || relationships.length === 0) return '—';
		return relationships
			.map((rel) => `${rel.accountName} (${formatLabel(rel.role)})`)
			.join(', ');
	};
</script>

<h1>Assets</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 flex flex-wrap items-center justify-between gap-3">
	<p class="text-sm text-slate-600">Manage assets for the current scenario.</p>
	<div class="flex flex-wrap gap-2">
		<a
			href="/assets/person/create"
			class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
		>
			Create person
		</a>
		<a
			href="/assets/property/create"
			class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
		>
			Create property
		</a>
		{#if data.assets.some((asset) => asset.asset_type === 'property')}
			<a
				href="/assets/mortgage/create"
				class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
			>
				Create mortgage
			</a>
		{/if}
		<a
			href="/assets/superannuation/create"
			class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
		>
			Create superannuation
		</a>
	</div>
</section>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<h2 class="text-lg font-semibold text-slate-900">Assets</h2>

	{#if data.assets.length === 0}
		<p class="mt-3 text-sm text-slate-600">No assets found for this scenario.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3">Start</th>
						<th class="px-4 py-3">Details</th>
						<th class="px-4 py-3">Accounts</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					{#each data.assets as asset}
						<tr class="whitespace-nowrap">
							<td class="px-4 py-3">{formatLabel(asset.asset_type)}</td>
							<td class="px-4 py-3 font-medium text-slate-900">{asset.name}</td>
							<td class="px-4 py-3">
								{formatMonth((asset.details?.startDate as string) ?? '')}
							</td>
							<td class="px-4 py-3 text-slate-600">
								{#if asset.asset_type === 'person'}
									DOB {formatMonth((asset.details?.dob as string) ?? '')}, retire{' '}
									{asset.details?.retirementAge ?? '—'}
								{:else if asset.asset_type === 'property'}
									Market value {asset.details?.marketValue ?? '—'}
								{:else}
									—
								{/if}
							</td>
							<td class="px-4 py-3 text-slate-600">
								{formatRelationships(asset.relationships)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

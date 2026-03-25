<script lang="ts">
	import type { PageData } from './$types';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatYearMonthInput } from '$lib/yearMonth';

	export let data: PageData;

	const formatMonth = (value?: unknown) => {
		const formatted = formatYearMonthInput(value);
		return formatted || '—';
	};

	const formatLabel = (value: string) =>
		value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const formatRelationships = (
		relationships: { accountName: string; role: string }[] | undefined
	) => {
		if (!relationships || relationships.length === 0) return '—';
		return relationships.map((rel) => `${rel.accountName} (${formatLabel(rel.role)})`).join(', ');
	};

	const formatTerm = (years?: number, months?: number) => {
		if (typeof years !== 'number' && typeof months !== 'number') return '—';
		const safeYears = typeof years === 'number' ? years : 0;
		const safeMonths = typeof months === 'number' ? months : 0;
		return `${safeYears}y ${safeMonths}m`;
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
				<thead
					class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
				>
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
								{formatMonth(asset.details?.startDate)}
							</td>
							<td class="px-4 py-3 text-slate-600">
								{#if asset.asset_type === 'person'}
									DOB {formatMonth(asset.details?.dob)}, retire{' '}
									{asset.details?.retirementAge ?? '—'}
								{:else if asset.asset_type === 'property'}
									Market value {asset.details?.marketValue ?? '—'}
								{:else if asset.asset_type === 'mortgage'}
									Term {formatTerm(
										asset.details?.termYears as number,
										asset.details?.termMonths as number
									)}
									{#if asset.details?.interestOnly}
										, interest-only until{' '}
										{formatMonth(asset.details?.interestOnlyEnd)}
									{/if}
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

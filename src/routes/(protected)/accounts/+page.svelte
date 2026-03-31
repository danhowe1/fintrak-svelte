<script lang="ts">
	import type { PageData } from './$types';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data: PageData;

	const formatLabel = (value: string) =>
		value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const formatCurrency = (value?: number) =>
		typeof value === 'number'
			? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
			: '—';

	const formatRelationships = (
		relationships: { assetName: string; role: string }[] | undefined
	) => {
		if (!relationships || relationships.length === 0) return '—';
		return relationships.map((rel) => `${rel.assetName} (${formatLabel(rel.role)})`).join(', ');
	};
</script>

<h1>Accounts</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 flex flex-wrap items-center justify-between gap-3">
	<p class="text-sm text-slate-600">Manage accounts for the current scenario.</p>
	<a
		href="/accounts/create"
		class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
	>
		Create account
	</a>
</section>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<h2 class="text-lg font-semibold text-slate-900">Accounts</h2>

	{#if data.accounts.length === 0}
		<p class="mt-3 text-sm text-slate-600">No accounts found for this scenario.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead
					class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
				>
					<tr>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3">Interest</th>
						<th class="px-4 py-3">Opening</th>
						<th class="px-4 py-3">Assets</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					{#each data.accounts as account}
						<tr class="whitespace-nowrap">
							<td class="px-4 py-3">{formatLabel(account.account_type)}</td>
							<td class="px-4 py-3 font-medium text-slate-900">{account.name}</td>
							<td class="px-4 py-3">
								{account.details?.interestRate ?? '—'}%
							</td>
							<td class="px-4 py-3">
								{formatCurrency(account.opening_balance)}
							</td>
							<td class="px-4 py-3 text-slate-600">
								{formatRelationships(account.relationships)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

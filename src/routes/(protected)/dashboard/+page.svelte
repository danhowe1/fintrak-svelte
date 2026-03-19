<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

	const formatLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
</script>

<h1>Dashboard</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<h2 class="text-lg font-semibold text-slate-900">Cashflows</h2>

	{#if data.cashflows.length === 0}
		<p class="mt-3 text-sm text-slate-600">No cashflows found for this scenario.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Category</th>
						<th class="px-4 py-3">Frequency</th>
						<th class="px-4 py-3">Amount</th>
						<th class="px-4 py-3">Start</th>
						<th class="px-4 py-3">End</th>
						<th class="px-4 py-3">Source</th>
						<th class="px-4 py-3">Destination</th>
						<th class="px-4 py-3">Description</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					{#each data.cashflows as cashflow}
						<tr>
							<td class="px-4 py-3">{formatLabel(cashflow.cashflow_type)}</td>
							<td class="px-4 py-3">{formatLabel(cashflow.category)}</td>
							<td class="px-4 py-3">{formatLabel(cashflow.frequency)}</td>
							<td class="px-4 py-3 font-medium text-slate-900">
								{formatCurrency(cashflow.amount)}
							</td>
							<td class="px-4 py-3">{cashflow.start_date}</td>
							<td class="px-4 py-3">{cashflow.end_date ?? '—'}</td>
							<td class="px-4 py-3">{cashflow.source_account_name ?? 'External'}</td>
							<td class="px-4 py-3">{cashflow.destination_account_name ?? 'External'}</td>
							<td class="px-4 py-3">{cashflow.description ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

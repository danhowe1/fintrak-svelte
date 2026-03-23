<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

	const formatLabel = (value: string) =>
		value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const formatMonth = (value?: string | Date | null) => {
		if (!value) return '—';
		if (value instanceof Date) {
			if (Number.isNaN(value.getTime())) return '—';
			const month = String(value.getMonth() + 1).padStart(2, '0');
			const year = value.getFullYear();
			return `${month} ${year}`;
		}

		const normalized =
			value.length === 7 ? `${value}-01` : value.length >= 10 ? value.slice(0, 10) : value;
		const date = new Date(value.length >= 10 ? value : `${normalized}T00:00:00`);
		if (Number.isNaN(date.getTime())) return '—';
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const year = date.getFullYear();
		return `${month} ${year}`;
	};
</script>

<h1>Dashboard</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<h2 class="text-lg font-semibold text-slate-900">Cashflows</h2>

	{#if data.cashflows.length === 0}
		<p class="mt-3 text-sm text-slate-600">No cashflows found for this scenario.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Category</th>
						<th class="px-4 py-3">Frequency</th>
						<th class="px-4 py-3">Amount</th>
						<th class="px-4 py-3">Inflation?</th>
						<th class="px-4 py-3">Start</th>
						<th class="px-4 py-3">End</th>
						<th class="px-4 py-3">Source</th>
						<th class="px-4 py-3">Source account</th>
						<th class="px-4 py-3">Destination</th>
						<th class="px-4 py-3">Destination account</th>
						<th class="px-4 py-3">Description</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					{#each data.cashflows as cashflow}
						<tr
							class={`whitespace-nowrap ${
								cashflow.cashflow_type === 'income'
									? 'text-emerald-600'
									: cashflow.cashflow_type === 'expense'
										? 'text-rose-600'
										: 'text-amber-600'
							}`}
						>
							<td class="px-4 py-3 font-semibold">{formatLabel(cashflow.cashflow_type)}</td>
							<td class="px-4 py-3">{formatLabel(cashflow.category)}</td>
							<td class="px-4 py-3">{formatLabel(cashflow.frequency)}</td>
							<td class="px-4 py-3 font-medium">
								{formatCurrency(cashflow.amount)}
							</td>
							<td class="px-4 py-3">
								<input
									type="checkbox"
									checked={cashflow.inflation_affected}
									disabled
									aria-label="Inflation affected"
									class="h-4 w-4 accent-slate-600"
								/>
							</td>
							<td class="px-4 py-3">{formatMonth(cashflow.start_date)}</td>
							<td class="px-4 py-3">{formatMonth(cashflow.end_date)}</td>
							<td class="px-4 py-3">{cashflow.source_asset_name ?? ''}</td>
							<td class="px-4 py-3">{cashflow.source_account_name ?? ''}</td>
							<td class="px-4 py-3">{cashflow.destination_asset_name ?? ''}</td>
							<td class="px-4 py-3">{cashflow.destination_account_name ?? ''}</td>
							<td class="px-4 py-3">{cashflow.description ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

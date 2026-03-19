<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const formatNumber = (value?: number) =>
		typeof value === 'number' ? value.toFixed(1) : '—';

	const formatMonth = (value?: string | Date) => {
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

<h1>Scenarios</h1>
<p class="text-sm text-slate-600">Select a scenario to view its cashflows.</p>

<section class="mt-6">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<p class="text-sm text-slate-600">Manage and create scenarios.</p>
		<a
			href="/scenarios/create"
			class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
		>
			Create scenario
		</a>
	</div>
</section>

<section class="mt-2 grid gap-4">
	{#if data.scenarios.length === 0}
		<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<p class="text-sm text-slate-600">No scenarios found.</p>
		</div>
	{:else}
		{#each data.scenarios as scenario}
			<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-slate-900">{scenario.name}</h2>
						<p class="mt-1 text-sm text-slate-600">
							Start month: {formatMonth(scenario.details?.startDate)}
						</p>
						<div class="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
							<div>Inflation rate: {formatNumber(scenario.details?.inflationRate)}%</div>
							<div>Interest rate rise: {formatNumber(scenario.details?.interestRateRise)}%</div>
						</div>
					</div>

					<a
						href={`/scenarios/select/${scenario.id}`}
						class="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
					>
						View dashboard
					</a>
				</div>
			</div>
		{/each}
	{/if}
</section>

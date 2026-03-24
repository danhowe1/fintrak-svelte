<script lang="ts">
	import type { PageData } from './$types';
	import { afterUpdate, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';

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

	const formatSignedCurrency = (value: number) => {
		const formatted = formatCurrency(Math.abs(value));
		return value < 0 ? `-${formatted}` : formatted;
	};

	const formatRate = (value: number, decimals: number) =>
		Number.isFinite(value) ? value.toFixed(decimals) : '0';

	let projectionData = data.projection;
	let sessionRates = data.sessionRates;
	let projectionVersion = 1;
	let projectionError: string | null = null;

	const chartColors = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0f172a'];

let projectionView: 'balances' | 'transactions' | 'balance_sheet' = 'balances';
let projectionRange: '1y' | '5y' | '10y' | 'all' = data.projectionRange ?? 'all';
let isUpdating = false;

	const refreshProjection = async () => {
		const url = new URL('/dashboard/projection', window.location.origin);
		url.searchParams.set('scenarioId', data.scenario.id);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error('Unable to refresh the projection. Please try again.');
		}
		const payload = await response.json();
		projectionData = payload.projection;
		sessionRates = payload.sessionRates;
		projectionRange = payload.projectionRange;
		projectionVersion += 1;
		projectionError = null;
	};

	const updateProjectionRange = async (range: typeof projectionRange) => {
		if (isUpdating) return;
		isUpdating = true;
		try {
			projectionRange = range;
			const formData = new FormData();
			formData.set('projectionRange', range);
			await fetch('?/updateRange', { method: 'POST', body: formData });
			await refreshProjection();
		} catch (error) {
			projectionError =
				error instanceof Error ? error.message : 'Unable to refresh the projection.';
		} finally {
			isUpdating = false;
		}
	};

	const updateRates = async (deltaInflation: number, deltaInterest: number) => {
		if (isUpdating) return;
		isUpdating = true;
		try {
			const formData = new FormData();
			formData.set('inflationRate', String(sessionRates.inflationRate));
			formData.set('interestRateChange', String(sessionRates.interestRateChange));
			formData.set('deltaInflation', String(deltaInflation));
			formData.set('deltaInterest', String(deltaInterest));
			await fetch('?/updateRates', { method: 'POST', body: formData });
			await refreshProjection();
		} catch (error) {
			projectionError =
				error instanceof Error ? error.message : 'Unable to refresh the projection.';
		} finally {
			isUpdating = false;
		}
	};

	const parseYearMonth = (value: unknown) => {
		if (!value) return null;
		const normalized =
			value instanceof Date
				? value.toISOString().slice(0, 10)
				: typeof value === 'string'
					? value
					: null;
		if (!normalized) return null;
		const match = normalized.match(/^(\d{4})-(\d{2})/);
		if (!match) return null;
		const year = Number(match[1]);
		const month = Number(match[2]);
		if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
		return { year, month };
	};

	const getBalanceExtent = (accounts: { points: { balance: number }[] }[]) => {
		const values = accounts.flatMap((account) => account.points.map((point) => point.balance));
		if (!values.length) {
			return { min: 0, max: 1 };
		}
		const min = Math.min(...values, 0);
		const max = Math.max(...values, 0);
		return { min, max: max === min ? min + 1 : max };
	};

	$: chartProjection = (() => {
		if (projectionRange === '10y' || projectionRange === 'all') {
			return {
				accounts: (projectionData.accounts ?? []).map((series) => ({
					...series,
					points: getAnnualPoints(series.points)
				})),
				transactions: projectionData.transactions ?? []
			};
		}
		return {
			accounts: projectionData.accounts ?? [],
			transactions: projectionData.transactions ?? []
		};
	})();
	$: totalSeries = (() => {
		const accounts = chartProjection.accounts ?? [];
		if (!accounts.length) return null;
		const maxPoints = Math.max(...accounts.map((account) => account.points.length));
		if (maxPoints === 0) return null;
		const points = Array.from({ length: maxPoints }).map((_, index) => {
			const sample = accounts[0]?.points[index];
			const balance = accounts.reduce(
				(sum, account) => sum + (account.points[index]?.balance ?? 0),
				0
			);
			return {
				date: sample?.date ?? '',
				monthLabel: sample?.monthLabel ?? '',
				balance
			};
		});
		return {
			accountId: 'total',
			accountName: 'Total',
			points
		};
	})();
	$: balanceExtent = getBalanceExtent(
		totalSeries ? [...chartProjection.accounts, totalSeries] : chartProjection.accounts
	);
	$: chartAxisPoints =
		chartProjection.accounts[0]?.points?.map((point) => ({
			date: point.date,
			monthLabel:
				projectionRange === '10y' || projectionRange === 'all'
					? point.date.slice(0, 4)
					: point.monthLabel
		})) ?? [];

	$: balanceSheetHeaders = chartAxisPoints.map((point) => point.monthLabel);
	$: balanceSheetRows = (() => {
		const accounts = chartProjection.accounts ?? [];
		if (accounts.length === 0) return [];
		const rows = [];
		if (totalSeries) {
			rows.push({
				name: 'Total',
				values: totalSeries.points.map((point) => point.balance)
			});
		}
		for (const account of accounts) {
			rows.push({
				name: account.accountName,
				values: account.points.map((point) => point.balance)
			});
		}
		return rows;
	})();

	const formatAxisCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0
		}).format(value);

	const getAnnualPoints = (points: { date: string; monthLabel: string; balance: number }[]) => {
		const byYear = new Map<number, { date: string; monthLabel: string; balance: number }>();
		for (const point of points) {
			const parsed = parseYearMonth(point.date);
			if (!parsed) continue;
			const existing = byYear.get(parsed.year);
			if (!existing || parsed.month > parseYearMonth(existing.date)!.month) {
				byYear.set(parsed.year, point);
			}
		}
		return Array.from(byYear.values()).sort((a, b) => a.date.localeCompare(b.date));
	};

	let chart: Chart | null = null;
	let chartCanvas: HTMLCanvasElement | null = null;
	const buildChartData = () => {
		const labels = chartAxisPoints.map((point) => point.monthLabel);
		const datasets = [];

		if (totalSeries) {
			datasets.push({
				label: 'Total',
				data: totalSeries.points.map((point) => point.balance),
				borderColor: '#111827',
				backgroundColor: 'rgba(17,24,39,0.08)',
				borderWidth: 2.5,
				pointRadius: 0,
				tension: 0.2
			});
		}

		for (const [index, series] of chartProjection.accounts.entries()) {
			datasets.push({
				label: series.accountName,
				data: series.points.map((point) => point.balance),
				borderColor: chartColors[index % chartColors.length],
				backgroundColor: 'transparent',
				borderWidth: 2,
				pointRadius: 0,
				tension: 0.2
			});
		}

		return { labels, datasets };
	};

	const buildChartOptions = () => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				position: 'bottom',
				labels: {
					usePointStyle: true,
					boxWidth: 8,
					boxHeight: 8,
					color: '#64748b',
					font: { size: 11, weight: '600' }
				}
			},
			tooltip: {
				enabled: true,
				callbacks: {
					label: (context: { dataset: { label?: string }; parsed: { y: number } }) =>
						`${context.dataset.label ?? ''}: ${formatAxisCurrency(context.parsed.y)}`
				}
			},
			zeroLine: {}
		},
		scales: {
			x: {
				ticks: {
					autoSkip: false,
					maxRotation: 60,
					minRotation: 60,
					color: '#94a3b8',
					font: { size: 9 }
				},
				grid: {
					color: '#e2e8f0',
					borderDash: [4, 4]
				}
			},
			y: {
				min: balanceExtent.min,
				max: balanceExtent.max,
				ticks: {
					color: '#94a3b8',
					callback: (value: number | string) =>
						formatAxisCurrency(typeof value === 'string' ? Number(value) : value)
				},
				title: {
					display: true,
					text: '$ Amount',
					color: '#64748b',
					font: { size: 10, weight: '600' }
				},
				grid: {
					color: '#e2e8f0',
					borderDash: [4, 4]
				}
			}
		}
	});

	const zeroLinePlugin = {
		id: 'zeroLine',
		afterDraw: (chartInstance: Chart) => {
			const yScale = chartInstance.scales?.y;
			if (!yScale) return;
			const zeroY = yScale.getPixelForValue(0);
			if (zeroY < yScale.top || zeroY > yScale.bottom) return;
			const ctx = chartInstance.ctx;
			ctx.save();
			ctx.strokeStyle = '#94a3b8';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(chartInstance.chartArea.left, zeroY);
			ctx.lineTo(chartInstance.chartArea.right, zeroY);
			ctx.stroke();
			ctx.restore();
		}
	};

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});

	const initChart = () => {
		if (projectionView !== 'balances') return;
		if (!chartCanvas || chart) return;
		chart = new Chart(chartCanvas, {
			type: 'line',
			data: buildChartData(),
			options: buildChartOptions(),
			plugins: [zeroLinePlugin]
		});
	};

	$: if (projectionView !== 'balances' && chart) {
		chart.destroy();
		chart = null;
	}

	$: if (chart && projectionVersion) {
		chart.data = buildChartData();
		chart.options = buildChartOptions();
		chart.update();
	}

	afterUpdate(() => {
		initChart();
	});
</script>

<h1>Dashboard</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold text-slate-900">Projections</h2>
		<div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'balances'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'balances')}
				>
					Balances chart
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'balance_sheet'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'balance_sheet')}
				>
					Balance sheet
				</button>
				<button
					type="button"
					class={`rounded-full px-3 py-1 transition ${
						projectionView === 'transactions'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'transactions')}
				>
					Transactions
				</button>
			</div>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === '1y'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('1y')}
				>
					1Y
				</button>
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === '5y'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('5y')}
				>
					5Y
				</button>
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === '10y'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('10y')}
				>
					10Y
				</button>
				<button
					type="button"
					disabled={isUpdating}
					class={`rounded-full px-3 py-1 transition ${
						projectionRange === 'all'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => updateProjectionRange('all')}
				>
					All
				</button>
			</div>
		</div>
	</div>
	<div class="mt-4 flex flex-wrap items-center gap-6 text-sm text-slate-700">
		<div class="flex items-center gap-3">
			<span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Inflation rate
			</span>
			<span class="text-sm font-semibold text-slate-900">
				{formatRate(sessionRates.inflationRate, 1)}%
			</span>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(-0.5, 0)}
				>
					-
				</button>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(0.5, 0)}
				>
					+
				</button>
			</div>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Interest rate change
			</span>
			<span class="text-sm font-semibold text-slate-900">
				{formatRate(sessionRates.interestRateChange, 2)}%
			</span>
			<div class="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(0, -0.25)}
				>
					-
				</button>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
					disabled={isUpdating}
					on:click={() => updateRates(0, 0.25)}
				>
					+
				</button>
			</div>
		</div>
	</div>
	{#if projectionError}
		<div class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
			{projectionError}
		</div>
	{/if}

	{#if projectionView === 'balances'}
		{#if chartProjection.accounts.length === 0}
			<p class="mt-3 text-sm text-slate-600">No accounts available for projection.</p>
		{:else}
			<div class="relative mt-4 h-72">
				<canvas bind:this={chartCanvas} class="h-full w-full"></canvas>
				{#if isUpdating}
					<div class="absolute inset-0 grid place-items-center rounded-xl bg-white/70">
						<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
							></span>
							<span>Updating projection…</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if projectionView === 'balance_sheet'}
		{#if chartProjection.accounts.length === 0}
			<p class="mt-3 text-sm text-slate-600">No accounts available for projection.</p>
		{:else}
			<div class="relative mt-4 max-h-96 overflow-x-auto overflow-y-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
					<thead
						class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
					>
						<tr>
							<th class="sticky left-0 z-10 bg-slate-50 px-4 py-3">Account</th>
							{#each balanceSheetHeaders as header}
								<th class="px-4 py-3 text-right">{header}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 text-slate-700">
						{#each balanceSheetRows as row, rowIndex}
							<tr
								class={`whitespace-nowrap ${
									rowIndex === 0 ? 'font-semibold text-slate-900' : ''
								}`}
							>
								<td
									class={`sticky left-0 z-10 px-4 py-3 ${
										rowIndex === 0 ? 'bg-white text-slate-900' : 'bg-white'
									}`}
								>
									{row.name}
								</td>
								{#each row.values as value}
									<td
										class={`px-4 py-3 text-right ${
											value >= 0 ? 'text-emerald-600' : 'text-rose-600'
										}`}
									>
										{formatCurrency(value)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				{#if isUpdating}
					<div class="absolute inset-0 grid place-items-center bg-white/70">
						<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
							></span>
							<span>Updating projection…</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if projectionData.transactions.length === 0}
		<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
	{:else}
		<div class="relative mt-4 max-h-96 overflow-x-auto overflow-y-auto">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead
					class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
				>
					<tr>
						<th class="px-4 py-3">Month</th>
						<th class="px-4 py-3">Account</th>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Category</th>
						<th class="px-4 py-3 text-right">Amount</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					{#each projectionData.transactions as transaction}
						<tr
							class={`whitespace-nowrap ${
								transaction.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
							}`}
						>
							<td class="px-4 py-3">{transaction.monthLabel}</td>
							<td class="px-4 py-3">{transaction.accountName}</td>
							<td class="px-4 py-3">{formatLabel(transaction.cashflowType)}</td>
							<td class="px-4 py-3">{formatLabel(transaction.category)}</td>
							<td class="px-4 py-3 text-right font-medium">
								{formatSignedCurrency(transaction.amount)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if isUpdating}
				<div class="absolute inset-0 grid place-items-center bg-white/70">
					<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
						<span
							class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
						></span>
						<span>Updating projection…</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</section>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<h2 class="text-lg font-semibold text-slate-900">Cashflows</h2>

	{#if data.cashflows.length === 0}
		<p class="mt-3 text-sm text-slate-600">No cashflows found for this scenario.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead
					class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
				>
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

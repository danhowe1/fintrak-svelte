<script lang="ts">
	import { afterUpdate, onDestroy, onMount } from 'svelte';
	import Chart from 'chart.js/auto';
	import AppTable from '$lib/components/ui/AppTable.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import type { ProjectionRange } from '$lib/dashboard/types';
	import {
		buildScenarioProjectionComparison,
		type ScenarioProjectionBalanceSource,
		type ScenarioProjectionEntry
	} from '$lib/scenarios/projection-comparison';

	export let scenarioProjections: ScenarioProjectionEntry[] = [];
	export let initialProjectionRange: ProjectionRange = 'all';

	const projectionViewOptions = [
		{ value: 'balances', label: 'Balances chart' },
		{ value: 'balance_sheet', label: 'Balance sheet' },
		{ value: 'profit_loss', label: 'P&L' }
	];
	const balanceSourceOptions = [
		{ value: 'net_worth', label: 'Net worth' },
		{ value: 'liquidity', label: 'Liquidity' }
	];
	const projectionRangeOptions = [
		{ value: '1y', label: '1Y' },
		{ value: '5y', label: '5Y' },
		{ value: '10y', label: '10Y' },
		{ value: 'all', label: 'All' }
	];
	const chartColors = ['#0f766e', '#1d4ed8', '#b45309', '#be123c', '#7c3aed', '#0f172a'];

	let projectionView: 'balances' | 'balance_sheet' | 'profit_loss' = 'balances';
	let projectionBalanceSource: ScenarioProjectionBalanceSource = 'net_worth';
	let projectionRange: ProjectionRange = initialProjectionRange;
	let chartCanvas: HTMLCanvasElement | null = null;
	let chart: Chart | null = null;

	const formatWholeCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0,
			minimumFractionDigits: 0
		}).format(value);

	const formatAxisCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0
		}).format(value);

	let comparison = buildScenarioProjectionComparison({
		scenarioProjections,
		projectionRange,
		projectionBalanceSource
	});

	$: comparison = buildScenarioProjectionComparison({
		scenarioProjections,
		projectionRange,
		projectionBalanceSource
	});

	const buildChartData = () => ({
		labels: comparison.balanceChart.labels,
		datasets: comparison.balanceChart.series.map((series, index) => ({
			label: series.name,
			data: series.values,
			borderColor: chartColors[index % chartColors.length],
			backgroundColor: 'transparent',
			borderWidth: 2,
			pointRadius: 0,
			spanGaps: true,
			tension: 0.2
		}))
	});

	const buildChartOptions = () => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				position: 'bottom' as const,
				labels: {
					usePointStyle: true,
					boxWidth: 8,
					boxHeight: 8,
					color: '#64748b',
					font: { size: 11, weight: 600 }
				}
			},
			tooltip: {
				enabled: true,
				callbacks: {
					label: (context: any) => {
						const label = context?.dataset?.label ?? '';
						const yValue = typeof context?.parsed?.y === 'number' ? context.parsed.y : 0;
						return `${label}: ${formatAxisCurrency(yValue)}`;
					}
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
				min: comparison.balanceExtent.min,
				max: comparison.balanceExtent.max,
				ticks: {
					color: '#94a3b8',
					font: { size: 9 },
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

	const renderChart = () => {
		if (!chartCanvas || projectionView !== 'balances') return;
		const chartData = buildChartData();
		if (chart) {
			chart.data = chartData as any;
			chart.options = buildChartOptions() as any;
			chart.update();
			return;
		}
		chart = new Chart(chartCanvas, {
			type: 'line',
			data: chartData,
			options: buildChartOptions(),
			plugins: [zeroLinePlugin]
		});
	};

	onMount(() => {
		renderChart();
	});

	afterUpdate(() => {
		if (projectionView !== 'balances' && chart) {
			chart.destroy();
			chart = null;
			return;
		}
		renderChart();
	});

	onDestroy(() => {
		chart?.destroy();
	});
</script>

<div class="app-panel relative">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="app-title-lg">Scenario projections</h2>
			<p class="app-text-muted mt-1">Compare projected totals across your scenarios.</p>
		</div>
		<div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
			<SegmentedControl
				class={`${
					projectionView === 'balances' || projectionView === 'balance_sheet'
						? ''
						: 'pointer-events-none invisible'
				}`}
				options={balanceSourceOptions}
				value={projectionBalanceSource}
				onChange={(next) => (projectionBalanceSource = next as ScenarioProjectionBalanceSource)}
			/>
			<SegmentedControl
				options={projectionViewOptions}
				value={projectionView}
				onChange={(next) => (projectionView = next as 'balances' | 'balance_sheet' | 'profit_loss')}
			/>
			<SegmentedControl
				options={projectionRangeOptions}
				value={projectionRange}
				onChange={(next) => (projectionRange = next as ProjectionRange)}
			/>
		</div>
	</div>

	{#if projectionView === 'balances'}
		{#if comparison.balanceChart.series.length === 0}
			<p class="app-text-muted mt-3">No scenario projections available.</p>
		{:else}
			<div class="relative mt-4 h-72">
				<canvas bind:this={chartCanvas} class="h-full w-full"></canvas>
			</div>
		{/if}
	{:else if projectionView === 'balance_sheet'}
		{#if comparison.balanceSheetRows.length === 0}
			<p class="app-text-muted mt-3">No scenario projections available.</p>
		{:else}
			<div class="mt-4 max-h-96 overflow-x-auto overflow-y-auto">
				<AppTable class="whitespace-nowrap">
					<thead
						class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
					>
						<tr>
							<th class="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3">Scenario</th>
							{#each comparison.balanceSheetHeaders as header}
								<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="app-table-body">
						{#each comparison.balanceSheetRows as row}
							<tr class="whitespace-nowrap">
								<td class="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-900">
									{row.name}
								</td>
								{#each row.values as value}
									<td
										class="px-4 py-3 text-right {value === null
											? 'text-slate-400'
											: value >= 0
												? 'text-emerald-600'
												: 'text-rose-600'}"
									>
										{value === null ? '-' : formatWholeCurrency(value)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</AppTable>
			</div>
		{/if}
	{:else if comparison.profitLossRows.length === 0}
		<p class="app-text-muted mt-3">No projected income or expense activity for these scenarios.</p>
	{:else}
		<div class="mt-4 max-h-96 overflow-x-auto overflow-y-auto">
			<AppTable class="whitespace-nowrap">
				<thead
					class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
				>
					<tr>
						<th class="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3">Item</th>
						{#each comparison.profitLossHeaders as header}
							<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
						{/each}
					</tr>
				</thead>
				<tbody class="app-table-body">
					{#each comparison.profitLossRows as row}
						<tr
							class="whitespace-nowrap {row.type === 'net' ? 'font-semibold text-slate-900' : ''}"
						>
							<td
								class="sticky left-0 z-10 bg-white px-4 py-3 {row.type === 'net'
									? 'text-slate-900'
									: ''}"
							>
								{row.name}
							</td>
							{#each row.values as value}
								<td
									class="px-4 py-3 text-right {value === 0
										? 'text-slate-400'
										: value > 0
											? 'text-emerald-600'
											: 'text-rose-600'}"
								>
									{value === 0 ? '-' : formatWholeCurrency(value)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</AppTable>
		</div>
	{/if}
</div>

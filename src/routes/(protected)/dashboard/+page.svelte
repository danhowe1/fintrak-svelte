<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/stores';

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

	const chartWidth = 1020;
	const chartHeight = 220;
	const chartPaddingX = 44;
	const chartPaddingY = 24;
	const chartColors = [
		'#0f766e',
		'#1d4ed8',
		'#7c3aed',
		'#b45309',
		'#be123c',
		'#0f172a'
	];

	let projectionView: 'balances' | 'transactions' = 'balances';
	let projectionRange: '1y' | '5y' | '10y' | 'all' = data.projectionRange ?? 'all';

	const updateProjectionRange = async (range: typeof projectionRange) => {
		projectionRange = range;
		const url = new URL(window.location.href);
		url.searchParams.set('projectionRange', range);
		await goto(`${url.pathname}?${url.searchParams.toString()}`, {
			replaceState: true,
			noScroll: true
		});
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
				accounts: (data.projection.accounts ?? []).map((series) => ({
					...series,
					points: getAnnualPoints(series.points)
				})),
				transactions: data.projection.transactions ?? []
			};
		}
		return {
			accounts: data.projection.accounts ?? [],
			transactions: data.projection.transactions ?? []
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

	const buildPath = (
		points: { balance: number }[],
		extent: { min: number; max: number }
	) => {
		if (!points.length) return '';
		const maxIndex = points.length - 1;
		const xFor = (index: number) =>
			chartPaddingX +
			(maxIndex === 0 ? 0 : (index / maxIndex) * (chartWidth - chartPaddingX * 2));

		const range = extent.max - extent.min || 1;
		const yFor = (value: number) =>
			chartHeight -
			chartPaddingY -
			((value - extent.min) / range) * (chartHeight - chartPaddingY * 2);

		return points
			.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.balance)}`)
			.join(' ');
	};

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

	const buildAxisLabels = (points: { date: string; monthLabel: string }[]) => {
		if (!points.length) return [];
		return points
			.map((point, index) => ({ point, index }))
			.filter((label) => label.point.monthLabel);
	};

	let tooltip:
		| { name: string; date: string; balance: number; x: number; y: number; color: string }
		| null = null;
	let pinnedTooltip:
		| { name: string; date: string; balance: number; x: number; y: number; color: string }
		| null = null;

	const getPointAtIndex = (
		series: { points: { date: string; monthLabel: string; balance: number }[] },
		index: number
	) => series.points[Math.min(Math.max(index, 0), series.points.length - 1)];

	const computeTooltip = (event: MouseEvent) => {
		if (!balanceExtent) return;
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const scaleX = chartWidth / rect.width;
		const scaleY = chartHeight / rect.height;
		const plotWidth = chartWidth - chartPaddingX * 2;
		const plotHeight = chartHeight - chartPaddingY * 2;
		const cssX = event.clientX - rect.left;
		const cssY = event.clientY - rect.top;
		const x = cssX * scaleX;
		const y = cssY * scaleY;
		if (x < chartPaddingX || x > chartWidth - chartPaddingX) {
			return null;
		}

		const allSeries = [
			...(totalSeries ? [totalSeries] : []),
			...chartProjection.accounts
		];
		const pointsLength = allSeries[0]?.points.length ?? 0;
		if (pointsLength === 0) {
			return null;
		}

		const index = Math.round(
			((x - chartPaddingX) / plotWidth) * (pointsLength - 1)
		);
		const range = balanceExtent.max - balanceExtent.min || 1;
		const yFor = (value: number) =>
			chartHeight -
			chartPaddingY -
			((value - balanceExtent.min) / range) * plotHeight;

		let closest:
			| {
					seriesName: string;
					point: { date: string; monthLabel: string; balance: number };
					dist: number;
					color: string;
			  }
			| null = null;
		for (const series of allSeries) {
			const point = getPointAtIndex(series, index);
			if (!point) continue;
			const dist = Math.abs(y - yFor(point.balance));
			const color =
				series.accountId === 'total'
					? '#111827'
					: chartColors[
							chartProjection.accounts.findIndex(
								(account) => account.accountId === series.accountId
							) % chartColors.length
						];
			if (!closest || dist < closest.dist) {
				closest = { seriesName: series.accountName, point, dist, color };
			}
		}

		if (!closest) {
			return null;
		}

		return {
			name: closest.seriesName,
			date: closest.point.monthLabel,
			balance: closest.point.balance,
			color: closest.color,
			x: (x + 12) / scaleX,
			y: yFor(closest.point.balance) / scaleY
		};
	};

	const handleChartHover = (event: MouseEvent) => {
		if (pinnedTooltip) return;
		tooltip = computeTooltip(event) ?? null;
	};

	const handleChartClick = (event: MouseEvent) => {
		const next = computeTooltip(event);
		pinnedTooltip = next ?? null;
		tooltip = pinnedTooltip;
	};

	const clearTooltip = () => {
		if (!pinnedTooltip) {
			tooltip = null;
		}
	};
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
					disabled={$navigating}
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
					disabled={$navigating}
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
					disabled={$navigating}
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
					disabled={$navigating}
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

	{#if projectionView === 'balances'}
		{#if chartProjection.accounts.length === 0}
			<p class="mt-3 text-sm text-slate-600">No accounts available for projection.</p>
		{:else}
			<div class="mt-4 relative">
				{#if balanceExtent}
					<div
						class="pointer-events-none absolute left-0 top-0 bottom-0 text-[10px] text-slate-400"
						style={`width: ${chartPaddingX}px`}
					>
						<div class="pl-1 pt-1 text-[10px] font-semibold text-slate-500">$ Amount</div>
						<div class="flex h-full flex-col justify-between pb-4 pt-4">
							<div class="pl-1">{formatAxisCurrency(balanceExtent.max)}</div>
							<div class="pl-1">
								{formatAxisCurrency(
									balanceExtent.min + (balanceExtent.max - balanceExtent.min) * 0.5
								)}
							</div>
							<div class="pl-1">{formatAxisCurrency(balanceExtent.min)}</div>
						</div>
					</div>
				{/if}
				<svg
					viewBox={`0 0 ${chartWidth} ${chartHeight}`}
					class="h-72 w-full rounded-xl border border-slate-100 bg-slate-50"
					on:mousemove={handleChartHover}
					on:click={handleChartClick}
					on:mouseleave={clearTooltip}
				>
					<rect
						x={chartPaddingX}
						y={chartPaddingY}
						width={chartWidth - chartPaddingX * 2}
						height={chartHeight - chartPaddingY * 2}
						fill="none"
						stroke="#e2e8f0"
						stroke-dasharray="4 4"
					/>
					{#if balanceExtent}
						{#if balanceExtent.min <= 0 && balanceExtent.max >= 0}
							<line
								x1={chartPaddingX}
								x2={chartWidth - chartPaddingX}
								y1={chartHeight -
									chartPaddingY -
									((0 - balanceExtent.min) /
										(balanceExtent.max - balanceExtent.min || 1)) *
										(chartHeight - chartPaddingY * 2)}
								y2={chartHeight -
									chartPaddingY -
									((0 - balanceExtent.min) /
										(balanceExtent.max - balanceExtent.min || 1)) *
										(chartHeight - chartPaddingY * 2)}
								stroke="#94a3b8"
								stroke-width="1.5"
							/>
						{/if}
					{/if}
					{#each buildAxisLabels(chartAxisPoints) as label}
						{#if chartAxisPoints.length > 1}
							<text
								x={chartPaddingX +
									(label.index / (chartAxisPoints.length - 1)) *
										(chartWidth - chartPaddingX * 2)}
								y={chartHeight - 4}
								font-size="9"
								fill="#94a3b8"
								text-anchor="end"
								transform={`rotate(-60 ${
									chartPaddingX +
									(label.index / (chartAxisPoints.length - 1)) *
										(chartWidth - chartPaddingX * 2)
								} ${chartHeight - 4})`}
							>
								{label.point.monthLabel}
							</text>
						{/if}
					{/each}
					{#if totalSeries}
						<path
							d={buildPath(totalSeries.points, balanceExtent)}
							fill="none"
							stroke="#111827"
							stroke-width="2.5"
						/>
					{/if}
					{#each chartProjection.accounts as series, index}
						<path
							d={buildPath(series.points, balanceExtent)}
							fill="none"
							stroke={chartColors[index % chartColors.length]}
							stroke-width="2"
						/>
					{/each}
				</svg>
				{#if tooltip}
					<div
						class="pointer-events-none absolute rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
						style={`left: ${tooltip.x}px; top: ${Math.max(tooltip.y - 36, 12)}px;`}
					>
						<div class="font-semibold text-slate-900">{tooltip.name}</div>
						<div class="text-slate-500">{tooltip.date}</div>
						<div class="mt-1 font-semibold text-slate-900">
							{formatAxisCurrency(tooltip.balance)}
						</div>
					</div>
				{/if}
				{#if $navigating}
					<div class="absolute inset-0 grid place-items-center rounded-xl bg-white/70">
						<div class="flex items-center gap-3 text-xs font-semibold text-slate-600">
							<span class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"></span>
							<span>Updating projection…</span>
						</div>
					</div>
				{/if}
				<div class="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
					{#if totalSeries}
						<div class="flex items-center gap-2">
							<span class="inline-block h-2.5 w-2.5 rounded-full bg-slate-900"></span>
							<span>Total</span>
						</div>
					{/if}
					{#each chartProjection.accounts as series, index}
						<div class="flex items-center gap-2">
							<span
								class="inline-block h-2.5 w-2.5 rounded-full"
								style={`background-color: ${chartColors[index % chartColors.length]}`}
							></span>
							<span>{series.accountName}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		{#if data.projection.transactions.length === 0}
			<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
		{:else}
			<div class="mt-4 max-h-96 overflow-y-auto overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs">
					<thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
						<tr>
							<th class="px-4 py-3">Month</th>
							<th class="px-4 py-3">Account</th>
							<th class="px-4 py-3">Type</th>
							<th class="px-4 py-3">Category</th>
							<th class="px-4 py-3 text-right">Amount</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 text-slate-700">
						{#each data.projection.transactions as transaction}
							<tr
								class={`whitespace-nowrap ${
									transaction.cashflowType === 'income'
										? 'text-emerald-600'
										: transaction.cashflowType === 'expense'
											? 'text-rose-600'
											: 'text-amber-600'
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
			</div>
		{/if}
	{/if}
</section>

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

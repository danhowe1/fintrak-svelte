<script lang="ts">
	import type { PageData } from './$types';
	import { afterUpdate, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';

	export let data: PageData;

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

	const formatWholeCurrency = (value: number) =>
		new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD',
			maximumFractionDigits: 0,
			minimumFractionDigits: 0
		}).format(value);

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

let projectionView: 'balances' | 'transactions' | 'balance_sheet' | 'profit_loss' = 'balances';
let projectionRange: '1y' | '5y' | '10y' | 'all' = data.projectionRange ?? 'all';
let isUpdating = false;
let expandedPnlNodes = new Set<string>();
let assetsTab: 'assets' | 'accounts' = 'assets';
let assetsList = data.assets ?? [];
let personRetirementAges: Record<string, number> = {};
let cashflowAmounts: Record<string, number> = {};
let propertyDetails: Record<string, { marketGrowthRate: number; saleDate: string }> = {};
let propertyErrors: Record<string, string> = {};
let lastScenarioId = data.scenario.id;
let updateTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const getRetirementAge = (asset: { details?: Record<string, unknown> }) => {
	const details = asset.details ?? {};
	const raw = details.retirementAge;
	const value = typeof raw === 'number' ? raw : Number(raw);
	return Number.isFinite(value) ? value : 0;
};

$: assetsList = data.assets ?? [];

$: if (data.scenario.id !== lastScenarioId) {
	personRetirementAges = {};
	cashflowAmounts = {};
	propertyDetails = {};
	propertyErrors = {};
	updateTimers = {};
	lastScenarioId = data.scenario.id;
}

$: if (Object.keys(personRetirementAges).length === 0 && (assetsList.length ?? 0) > 0) {
	const next: Record<string, number> = {};
	for (const asset of assetsList) {
		if (asset.asset_type === 'person') {
			next[asset.id] = getRetirementAge(asset);
		}
	}
	personRetirementAges = next;
}

$: if (Object.keys(cashflowAmounts).length === 0 && (data.cashflows?.length ?? 0) > 0) {
	const next: Record<string, number> = {};
	for (const cashflow of data.cashflows ?? []) {
		next[cashflow.id] = cashflow.amount;
	}
	cashflowAmounts = next;
}

$: if (Object.keys(propertyDetails).length === 0 && (assetsList.length ?? 0) > 0) {
	const next: Record<string, { marketGrowthRate: number; saleDate: string }> = {};
	for (const asset of assetsList) {
		if (asset.asset_type === 'property') {
			const details = asset.details ?? {};
			const rawRate = details.marketGrowthRate;
			const rate = typeof rawRate === 'number' ? rawRate : Number(rawRate);
			const rawSaleDate = details.saleDate;
			const saleDate =
				typeof rawSaleDate === 'string' ? toMonthYearInput(rawSaleDate) : '';
			next[asset.id] = {
				marketGrowthRate: Number.isFinite(rate) ? rate : 0,
				saleDate
			};
		}
	}
	propertyDetails = next;
}

const setPersonRetirementAge = (id: string, value: number) => {
	personRetirementAges = { ...personRetirementAges, [id]: value };
};

const getAssetCashflows = (assetName: string) =>
	(data.cashflows ?? []).filter((cashflow) => {
		if (cashflow.cashflow_type === 'expense') {
			return cashflow.source_asset_name === assetName;
		}
		if (cashflow.cashflow_type === 'income') {
			return cashflow.destination_asset_name === assetName;
		}
		return false;
	});

const setCashflowAmount = (id: string, value: number) => {
	cashflowAmounts = { ...cashflowAmounts, [id]: value };
};

const setPropertyDetails = (
	id: string,
	value: { marketGrowthRate: number; saleDate: string }
) => {
	propertyDetails = { ...propertyDetails, [id]: value };
};

const setPropertyError = (id: string, message: string) => {
	propertyErrors = { ...propertyErrors, [id]: message };
};

const isValidMonthYear = (value: string) => /^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());
const toMonthYearInput = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return '';
	const isoMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
	if (isoMatch) {
		return `${isoMatch[2]} ${isoMatch[1]}`;
	}
	const altMatch = trimmed.match(/^(\d{2})(\s|\/|-)?(\d{4})$/);
	if (altMatch) {
		return `${altMatch[1]} ${altMatch[3]}`;
	}
	return trimmed;
};

const stepForValue = (value: number) => {
	const absValue = Math.abs(value);
	if (absValue <= 1) return 0.25;
	if (absValue <= 100) return 1;
	if (absValue <= 1000) return 100;
	if (absValue <= 10000) return 500;
	if (absValue <= 100000) return 5000;
	if (absValue <= 1000000) return 50000;
	return 500000;
};

const scheduleUpdate = (key: string, handler: () => void) => {
	if (updateTimers[key]) {
		clearTimeout(updateTimers[key]);
	}
	updateTimers = {
		...updateTimers,
		[key]: setTimeout(handler, 350)
	};
};

	const togglePnlNode = (id: string) => {
		const next = new Set(expandedPnlNodes);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedPnlNodes = next;
	};

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

const updateRetirementAge = async (assetId: string, retirementAge: number) => {
	if (isUpdating) return;
	isUpdating = true;
	try {
		const formData = new FormData();
		formData.set('scenarioId', data.scenario.id);
		formData.set('assetId', assetId);
		formData.set('retirementAge', String(retirementAge));
		const response = await fetch('?/updateRetirementAge', { method: 'POST', body: formData });
		if (!response.ok) {
			throw new Error('Unable to update retirement age. Please try again.');
		}
		await refreshProjection();
	} catch (error) {
		projectionError =
			error instanceof Error ? error.message : 'Unable to update retirement age.';
	} finally {
		isUpdating = false;
	}
};

const updateCashflowAmount = async (cashflowId: string, amount: number) => {
	if (isUpdating) return;
	isUpdating = true;
	try {
		const formData = new FormData();
		formData.set('scenarioId', data.scenario.id);
		formData.set('cashflowId', cashflowId);
		formData.set('amount', String(amount));
		const response = await fetch('?/updateCashflowAmount', { method: 'POST', body: formData });
		if (!response.ok) {
			throw new Error('Unable to update cashflow amount. Please try again.');
		}
		await refreshProjection();
	} catch (error) {
		projectionError =
			error instanceof Error ? error.message : 'Unable to update cashflow amount.';
	} finally {
		isUpdating = false;
	}
};

const updatePropertyDetails = async (
	assetId: string,
	marketGrowthRate: number,
	saleDate: string
) => {
	if (isUpdating) return;
	isUpdating = true;
	try {
		const formData = new FormData();
		formData.set('scenarioId', data.scenario.id);
		formData.set('assetId', assetId);
		formData.set('marketGrowthRate', String(marketGrowthRate));
		formData.set('saleDate', saleDate);
		const response = await fetch('?/updatePropertyDetails', { method: 'POST', body: formData });
		if (!response.ok) {
			throw new Error('Unable to update property details. Please try again.');
		}
		await refreshProjection();
	} catch (error) {
		projectionError =
			error instanceof Error ? error.message : 'Unable to update property details.';
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

	type PnlNode = {
		id: string;
		label: string;
		level: number;
		values: number[];
		children?: PnlNode[];
	};

	const sumArrays = (arrays: number[][], length: number) => {
		const totals = Array(length).fill(0);
		for (const arr of arrays) {
			arr.forEach((value, idx) => {
				totals[idx] += value;
			});
		}
		return totals;
	};

	$: profitLossTree = (() => {
		if (projectionData.transactions.length === 0) return [];
		const headers = chartAxisPoints.map((point) => point.monthLabel);
		const indexByLabel = new Map<string, number>();
		headers.forEach((label, index) => indexByLabel.set(label, index));

		const buildMaps = () =>
			new Map<string, Map<string, Map<string, number[]>>>();
		const incomeMap = buildMaps();
		const expenseMap = buildMaps();

		for (const transaction of projectionData.transactions) {
			if (transaction.cashflowType === 'transfer') continue;
			const label =
				projectionRange === '10y' || projectionRange === 'all'
					? transaction.date.slice(0, 4)
					: transaction.monthLabel;
			const idx = indexByLabel.get(label);
			if (idx === undefined) continue;

			const targetMap = transaction.cashflowType === 'income' ? incomeMap : expenseMap;
			const accountName = transaction.accountName;
			const category = formatLabel(transaction.category);
			const description = transaction.description ?? '—';

			const categoryMap =
				targetMap.get(accountName) ?? new Map<string, Map<string, number[]>>();
			const descMap = categoryMap.get(category) ?? new Map<string, number[]>();
			const values = descMap.get(description) ?? Array(headers.length).fill(0);

			values[idx] += transaction.amount;
			descMap.set(description, values);
			categoryMap.set(category, descMap);
			targetMap.set(accountName, categoryMap);
		}

		const buildAccountNodes = (map: Map<string, Map<string, Map<string, number[]>>>) => {
			const nodes: PnlNode[] = [];
			const sortedAccounts = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
			for (const accountName of sortedAccounts) {
				const categoryMap = map.get(accountName)!;
				const categoryNodes: PnlNode[] = [];
				const categoryTotals: number[][] = [];

				for (const category of Array.from(categoryMap.keys()).sort((a, b) =>
					a.localeCompare(b)
				)) {
					const descMap = categoryMap.get(category)!;
					const descNodes: PnlNode[] = [];
					const descTotals: number[][] = [];

					for (const description of Array.from(descMap.keys()).sort((a, b) =>
						a.localeCompare(b)
					)) {
						const values = descMap.get(description)!;
						descTotals.push(values);
						descNodes.push({
							id: `${accountName}|${category}|${description}`,
							label: description,
							level: 3,
							values
						});
					}

					const categoryValues = sumArrays(descTotals, headers.length);
					categoryTotals.push(categoryValues);
					categoryNodes.push({
						id: `${accountName}|${category}`,
						label: category,
						level: 2,
						values: categoryValues,
						children: descNodes
					});
				}

				const accountValues = sumArrays(categoryTotals, headers.length);
				nodes.push({
					id: accountName,
					label: accountName,
					level: 1,
					values: accountValues,
					children: categoryNodes
				});
			}
			return nodes;
		};

		const incomeAccounts = buildAccountNodes(incomeMap);
		const expenseAccounts = buildAccountNodes(expenseMap);

		const incomeTotals = sumArrays(
			incomeAccounts.map((node) => node.values),
			headers.length
		);
		const expenseTotals = sumArrays(
			expenseAccounts.map((node) => node.values),
			headers.length
		);
		const netTotals = incomeTotals.map((value, idx) => value + expenseTotals[idx]);

		return [
			{
				id: 'income',
				label: 'Income',
				level: 0,
				values: incomeTotals,
				children: incomeAccounts
			},
			{
				id: 'expenses',
				label: 'Expenses',
				level: 0,
				values: expenseTotals,
				children: expenseAccounts
			},
			{
				id: 'net',
				label: 'Net',
				level: 0,
				values: netTotals
			}
		] as PnlNode[];
	})();

	const flattenPnl = (nodes: PnlNode[], expanded: Set<string>) => {
		const rows: PnlNode[] = [];
		for (const node of nodes) {
			rows.push(node);
			if (node.children && expanded.has(node.id)) {
				rows.push(...flattenPnl(node.children, expanded));
			}
		}
		return rows;
	};

	$: profitLossRows = flattenPnl(profitLossTree, expandedPnlNodes);

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

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold text-slate-900">
			Projections for {data.scenario.name}
		</h2>
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
						projectionView === 'profit_loss'
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:text-slate-900'
					}`}
					on:click={() => (projectionView = 'profit_loss')}
				>
					P&amp;L
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
							<th class="sticky left-0 top-0 z-20 bg-slate-50 px-4 py-3">Account</th>
							{#each balanceSheetHeaders as header}
								<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
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
										{formatWholeCurrency(value)}
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
	{:else if projectionView === 'profit_loss'}
		{#if profitLossRows.length === 0}
			<p class="mt-3 text-sm text-slate-600">No projected transactions for this scenario.</p>
		{:else}
			<div class="relative mt-4 max-h-96 overflow-x-auto overflow-y-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs whitespace-nowrap">
					<thead
						class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase"
					>
						<tr>
							<th class="sticky left-0 top-0 z-20 bg-slate-50 px-4 py-3">Item</th>
							{#each balanceSheetHeaders as header}
								<th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right">{header}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 text-slate-700">
						{#each profitLossRows as row, rowIndex}
							<tr
								class={`whitespace-nowrap ${
									row.level === 0 ? 'font-semibold text-slate-900' : ''
								}`}
							>
								<td
									class={`sticky left-0 z-10 px-4 py-3 ${
										row.level === 0 ? 'bg-white text-slate-900' : 'bg-white'
									}`}
								>
									<div class="flex items-center gap-2" style={`padding-left: ${row.level * 14}px`}>
										{#if row.children?.length}
											<button
												type="button"
												class="text-slate-500 hover:text-slate-900"
												on:click={() => togglePnlNode(row.id)}
												aria-label="Toggle P&L row"
											>
												{expandedPnlNodes.has(row.id) ? '▾' : '▸'}
											</button>
										{:else}
											<span class="w-3 text-slate-400">•</span>
										{/if}
										<span>{row.label}</span>
									</div>
								</td>
								{#each row.values as value}
									<td
										class={`px-4 py-3 text-right ${
											value >= 0 ? 'text-emerald-600' : 'text-rose-600'
										}`}
									>
										{formatWholeCurrency(value)}
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
						<th class="px-4 py-3">Date</th>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Asset</th>
						<th class="px-4 py-3">Category</th>
						<th class="px-4 py-3">Description</th>
						<th class="px-4 py-3">Account</th>
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
							<td class="px-4 py-3">{formatLabel(transaction.cashflowType)}</td>
							<td class="px-4 py-3">{transaction.assetName ?? ''}</td>
							<td class="px-4 py-3">{formatLabel(transaction.category)}</td>
							<td class="px-4 py-3">{transaction.description ?? ''}</td>
							<td class="px-4 py-3">{transaction.accountName}</td>
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

<section class="not-prose mt-6">
	<div class="inline-flex items-end gap-1">
		<button
			type="button"
			class={`relative rounded-t-xl border border-b-0 px-4 py-2 text-xs font-semibold ${
				assetsTab === 'assets'
					? '-mb-px z-10 border-slate-200 bg-white text-slate-900 shadow-none'
					: 'border-slate-300 bg-slate-100 text-slate-600'
			}`}
			on:click={() => (assetsTab = 'assets')}
		>
			Assets
			{#if assetsTab === 'assets'}
				<span class="absolute inset-x-0 -bottom-px h-px bg-white"></span>
			{/if}
		</button>
		<button
			type="button"
			class={`relative rounded-t-xl border border-b-0 px-4 py-2 text-xs font-semibold ${
				assetsTab === 'accounts'
					? '-mb-px z-10 border-slate-200 bg-white text-slate-900 shadow-none'
					: 'border-slate-300 bg-slate-100 text-slate-600'
			}`}
			on:click={() => (assetsTab = 'accounts')}
		>
			Accounts
			{#if assetsTab === 'accounts'}
				<span class="absolute inset-x-0 -bottom-px h-px bg-white"></span>
			{/if}
		</button>
	</div>
	<div class="rounded-2xl rounded-tl-none border border-slate-200 bg-white p-4 shadow-sm">
		<div class="h-px w-full bg-transparent"></div>
	{#if assetsTab === 'assets'}
		<div class="mt-5 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
			{#each assetsList.filter((asset) => asset.asset_type === 'person') as person}
				<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
					<h3 class="text-sm font-semibold text-slate-900">{person.name}</h3>
					<div class="mt-3 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Retirement age</span>
						<input
							type="number"
							class="ml-auto w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
							value={personRetirementAges[person.id] ?? ''}
							step={stepForValue(personRetirementAges[person.id] ?? 0)}
							on:input={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const value = Number.isFinite(next) ? next : 0;
								setPersonRetirementAge(person.id, value);
								scheduleUpdate(`retirement:${person.id}`, () =>
									updateRetirementAge(person.id, value)
								);
							}}
						/>
					</div>
					<div class="mt-3 space-y-2">
						{#each getAssetCashflows(person.name) as cashflow}
							<div
								class={`grid grid-cols-[140px_1fr] items-center gap-1 text-xs ${
									cashflow.cashflow_type === 'income'
										? 'text-emerald-600'
										: 'text-rose-600'
								}`}
							>
								<span class="truncate">
									{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
								</span>
								<input
									type="number"
									class="ml-auto w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
									value={cashflowAmounts[cashflow.id] ?? cashflow.amount}
									step={Math.max(
										stepForValue(cashflowAmounts[cashflow.id] ?? cashflow.amount),
										0.25
									)}
									on:input={(event) => {
										const next = Number((event.currentTarget as HTMLInputElement).value);
										const value = Number.isFinite(next) ? next : 0;
										setCashflowAmount(cashflow.id, value);
										scheduleUpdate(`cashflow:${cashflow.id}`, () =>
											updateCashflowAmount(cashflow.id, value)
										);
									}}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/each}
			{#each assetsList.filter((asset) => asset.asset_type === 'property') as property}
				<div class="w-fit max-w-xs rounded-xl border border-slate-200 bg-slate-50 p-3">
					<h3 class="text-sm font-semibold text-slate-900">{property.name}</h3>
					<div class="mt-3 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Market growth rate</span>
						<input
							type="number"
							class="ml-auto w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
							value={formatRate(propertyDetails[property.id]?.marketGrowthRate ?? 0, 1)}
							step="0.5"
							on:input={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = propertyDetails[property.id] ?? {
									marketGrowthRate: 0,
									saleDate: ''
								};
								setPropertyDetails(property.id, {
									...current,
									marketGrowthRate: Number.isFinite(next) ? next : 0
								});
							}}
							on:change={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = propertyDetails[property.id] ?? {
									marketGrowthRate: 0,
									saleDate: ''
								};
								const value = Number.isFinite(next) ? next : 0;
								setPropertyDetails(property.id, { ...current, marketGrowthRate: value });
								scheduleUpdate(`property:${property.id}`, () =>
									updatePropertyDetails(
										property.id,
										value,
										current.saleDate ?? ''
									)
								);
							}}
						/>
					</div>
					<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
						<span class="truncate text-slate-500">Sale date (MM YYYY)</span>
						<div class="ml-auto flex flex-col items-end">
							<input
								type="text"
								inputmode="numeric"
								pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
								class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
								value={propertyDetails[property.id]?.saleDate ?? ''}
								on:input={(event) => {
									const next = (event.currentTarget as HTMLInputElement).value;
									const current = propertyDetails[property.id] ?? {
										marketGrowthRate: 0,
										saleDate: ''
									};
									setPropertyDetails(property.id, { ...current, saleDate: next });
									if (next.trim().length === 0 || isValidMonthYear(next)) {
										setPropertyError(property.id, '');
									}
								}}
								on:change={(event) => {
									const next = (event.currentTarget as HTMLInputElement).value;
									const current = propertyDetails[property.id] ?? {
										marketGrowthRate: 0,
										saleDate: ''
									};
									if (next.trim().length > 0 && !isValidMonthYear(next)) {
										setPropertyError(property.id, 'Use MM YYYY format.');
										return;
									}
									setPropertyError(property.id, '');
									setPropertyDetails(property.id, { ...current, saleDate: next });
									scheduleUpdate(`property:${property.id}`, () =>
										updatePropertyDetails(
											property.id,
											current.marketGrowthRate ?? 0,
											next
										)
									);
								}}
							/>
							{#if propertyErrors[property.id]}
								<span class="mt-1 text-[10px] text-rose-600">
									{propertyErrors[property.id]}
								</span>
							{/if}
						</div>
					</div>
					<div class="mt-3 space-y-2">
						{#each getAssetCashflows(property.name) as cashflow}
							<div
								class={`grid grid-cols-[140px_1fr] items-center gap-1 text-xs ${
									cashflow.cashflow_type === 'income'
										? 'text-emerald-600'
										: 'text-rose-600'
								}`}
							>
								<span class="truncate">
									{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
								</span>
								<input
									type="number"
									class="ml-auto w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
									value={cashflowAmounts[cashflow.id] ?? cashflow.amount}
									step={Math.max(
										stepForValue(cashflowAmounts[cashflow.id] ?? cashflow.amount),
										0.25
									)}
									on:input={(event) => {
										const next = Number(
											(event.currentTarget as HTMLInputElement).value
										);
										const value = Number.isFinite(next) ? next : 0;
										setCashflowAmount(cashflow.id, value);
									}}
									on:change={(event) => {
										const next = Number(
											(event.currentTarget as HTMLInputElement).value
										);
										const value = Number.isFinite(next) ? next : 0;
										setCashflowAmount(cashflow.id, value);
										scheduleUpdate(`cashflow:${cashflow.id}`, () =>
											updateCashflowAmount(cashflow.id, value)
										);
									}}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="mt-5 text-sm text-slate-600">No accounts to show yet.</div>
	{/if}
	</div>
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
						<th class="px-4 py-3">Start</th>
						<th class="px-4 py-3">End</th>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Asset</th>
						<th class="px-4 py-3">Category</th>
						<th class="px-4 py-3">Description</th>
						<th class="px-4 py-3">Frequency</th>
						<th class="px-4 py-3">Inflation?</th>
						<th class="px-4 py-3">Source account</th>
						<th class="px-4 py-3">Destination account</th>
						<th class="px-4 py-3">Amount</th>
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
							<td class="px-4 py-3">{formatMonth(cashflow.start_date)}</td>
							<td class="px-4 py-3">{formatMonth(cashflow.end_date)}</td>
							<td class="px-4 py-3 font-semibold">{formatLabel(cashflow.cashflow_type)}</td>
							<td class="px-4 py-3">
								{cashflow.cashflow_type === 'expense'
									? cashflow.source_asset_name ?? ''
									: cashflow.cashflow_type === 'income'
										? cashflow.destination_asset_name ?? ''
										: ''}
							</td>
							<td class="px-4 py-3">{formatLabel(cashflow.category)}</td>
							<td class="px-4 py-3">{cashflow.description}</td>
							<td class="px-4 py-3">{formatLabel(cashflow.frequency)}</td>
							<td class="px-4 py-3">
								<input
									type="checkbox"
									checked={cashflow.inflation_affected}
									disabled
									aria-label="Inflation affected"
									class="h-4 w-4 accent-slate-600"
								/>
							</td>
							<td class="px-4 py-3">{cashflow.source_account_name ?? ''}</td>
							<td class="px-4 py-3">{cashflow.destination_account_name ?? ''}</td>
							<td class="px-4 py-3 font-medium">
								{formatCurrency(cashflowAmounts[cashflow.id] ?? cashflow.amount)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

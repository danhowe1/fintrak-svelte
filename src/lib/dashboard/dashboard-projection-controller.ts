import { fromYearMonthInt } from '$lib/yearMonth';
import type {
	ChartSeries,
	PnlNode,
	ProjectionBalanceSource,
	ProjectionRange,
	TransactionSortDirection,
	TransactionSortKey
} from '$lib/dashboard/types';

type ProjectionLike = {
	startDate: number;
	accounts?: any[];
	assets?: any[];
	transactions?: any[];
	liquidity?: {
		series?: any[];
		points?: any[];
	};
};

type AccountLike = {
	id: string;
	account_type?: string;
};

type DerivedInput = {
	projectionData: ProjectionLike;
	accountsList: AccountLike[];
	projectionBalanceSource: ProjectionBalanceSource;
	projectionRange: ProjectionRange;
	transactionSortKey: TransactionSortKey;
	transactionSortDirection: TransactionSortDirection;
	expandedPnlNodes: Set<string>;
	formatLabel: (value: string) => string;
};

const getRangeMonths = (range: ProjectionRange) => {
	switch (range) {
		case '1y':
			return 12;
		case '5y':
			return 60;
		case '10y':
			return 120;
		default:
			return null;
	}
};

const getRangeEndDate = (startDate: number, range: ProjectionRange) => {
	const months = getRangeMonths(range);
	if (!months) return null;
	const start = fromYearMonthInt(startDate);
	if (!start) return null;
	let year = start.year;
	let month = start.month + (months - 1);
	while (month > 12) {
		month -= 12;
		year += 1;
	}
	return year * 100 + month;
};

const clipSeriesPointsByRange = <T extends { date: number }>(points: T[], rangeEndDate: number | null) => {
	if (rangeEndDate === null) return points;
	return points.filter((point) => point.date <= rangeEndDate);
};

const clipTransactionsByRange = (transactions: any[], rangeEndDate: number | null) => {
	if (rangeEndDate === null) return transactions;
	return transactions.filter((transaction) => transaction.date <= rangeEndDate);
};

const normalizeAccountSeries = (series: { accountId: string; accountName: string; points: any[] }) => ({
	id: series.accountId,
	name: series.accountName,
	points: (series.points ?? []).map((point) => ({
		date: point.date,
		monthLabel: point.monthLabel,
		balance: point.balance
	}))
});

const normalizeAssetSeries = (series: { assetId: string; assetName: string; points: any[] }) => ({
	id: series.assetId,
	name: series.assetName,
	points: (series.points ?? []).map((point) => ({
		date: point.date,
		monthLabel: point.monthLabel,
		balance: point.value
	}))
});

const getAnnualPoints = (points: { date: number; monthLabel: string; balance: number }[]) => {
	const byYear = new Map<number, { date: number; monthLabel: string; balance: number }>();
	for (const point of points) {
		const parsed = fromYearMonthInt(point.date);
		if (!parsed) continue;
		const existing = byYear.get(parsed.year);
		const existingMonth = existing ? (fromYearMonthInt(existing.date)?.month ?? 0) : 0;
		if (!existing || parsed.month > existingMonth) {
			byYear.set(parsed.year, point);
		}
	}
	return Array.from(byYear.values()).sort((a, b) => a.date - b.date);
};

const getBalanceExtent = (seriesList: ChartSeries[]) => {
	const values = seriesList.flatMap((series) => series.points.map((point) => point.balance));
	if (!values.length) return { min: 0, max: 1 };
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 0);
	return { min, max: max === min ? min + 1 : max };
};

const sumArrays = (arrays: number[][], length: number) => {
	const totals = Array(length).fill(0);
	for (const arr of arrays) {
		arr.forEach((value, idx) => {
			const safeValue = Number.isFinite(value) ? value : 0;
			totals[idx] += safeValue;
		});
	}
	return totals;
};

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

export const buildDashboardProjectionDerived = (input: DerivedInput) => {
	const {
		projectionData,
		accountsList,
		projectionBalanceSource,
		projectionRange,
		transactionSortKey,
		transactionSortDirection,
		expandedPnlNodes,
		formatLabel
	} = input;

	const projectionRangeEndDate = getRangeEndDate(projectionData.startDate, projectionRange);

	const accountSeries = (projectionData.accounts ?? [])
		.filter((series: any) => {
			const account = accountsList.find((item) => item.id === series.accountId);
			return account?.account_type !== 'brokerage' && account?.account_type !== 'super_account';
		})
		.map(normalizeAccountSeries);
	const assetSeries = (projectionData.assets ?? []).map(normalizeAssetSeries);
	const activeSeries =
		projectionBalanceSource === 'assets'
			? assetSeries
			: projectionBalanceSource === 'liquidity'
				? (() => {
						const liquiditySeries = (projectionData.liquidity?.series ?? []).map((series: any) => ({
							id: series.id,
							name: series.name,
							points: (series.points ?? []).map((point: any) => ({
								date: point.date,
								monthLabel: point.monthLabel,
								balance: point.balance
							}))
						}));
						if (liquiditySeries.length > 0) return liquiditySeries as ChartSeries[];
						return [
							{
								id: 'liquidity',
								name: 'Liquidity',
								points: (projectionData.liquidity?.points ?? []).map((point: any) => ({
									date: point.date,
									monthLabel: point.monthLabel,
									balance: point.balance
								}))
							}
						] as ChartSeries[];
					})()
				: projectionBalanceSource === 'net_worth'
					? ([...accountSeries, ...assetSeries] as ChartSeries[])
					: accountSeries;

	const chartProjection =
		projectionRange === '10y' || projectionRange === 'all'
			? {
					series: activeSeries.map((series: any) => ({
						...series,
						points: getAnnualPoints(clipSeriesPointsByRange(series.points, projectionRangeEndDate))
					})),
					transactions: clipTransactionsByRange(projectionData.transactions ?? [], projectionRangeEndDate)
				}
			: {
					series: activeSeries.map((series: any) => ({
						...series,
						points: clipSeriesPointsByRange(series.points, projectionRangeEndDate)
					})),
					transactions: clipTransactionsByRange(projectionData.transactions ?? [], projectionRangeEndDate)
				};

	const seriesList = chartProjection.series ?? [];
	const totalSeries = (() => {
		if (!seriesList.length) return null;
		const maxPoints = Math.max(...seriesList.map((series: any) => series.points.length));
		if (maxPoints === 0) return null;
		const points = Array.from({ length: maxPoints }).map((_, index) => {
			const sample = seriesList[0]?.points[index];
			const balance = seriesList.reduce(
				(sum: number, series: any) => sum + (series.points[index]?.balance ?? 0),
				0
			);
			return {
				date: sample?.date ?? 0,
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

	const balanceExtent = getBalanceExtent(
		totalSeries ? [...chartProjection.series, normalizeAccountSeries(totalSeries)] : chartProjection.series
	);

	const chartAxisPoints = (chartProjection.series[0]?.points ?? []).map((point: any) => ({
		date: point.date,
		monthLabel:
			projectionRange === '10y' || projectionRange === 'all'
				? String(fromYearMonthInt(point.date)?.year ?? '')
				: point.monthLabel
	}));

	const balanceSheetHeaders = chartAxisPoints.map((point: any) => point.monthLabel);
	const balanceSheetRows = (() => {
		if (seriesList.length === 0) return [];
		const rows: { name: string; values: number[] }[] = [];
		if (totalSeries) {
			rows.push({ name: 'Total', values: totalSeries.points.map((point) => point.balance) });
		}
		for (const series of seriesList) {
			rows.push({ name: series.name, values: series.points.map((point: any) => point.balance) });
		}
		return rows;
	})();

	const transactionPivot = (() => {
		const transactions = chartProjection.transactions ?? [];
		const isAnnualRange = projectionRange === '10y' || projectionRange === 'all';
		if (transactions.length === 0) {
			return {
				headers: [] as string[],
				totalValues: [] as number[],
				rows: [] as {
					assetName: string;
					accountName: string;
					type: string;
					category: string;
					description: string;
					values: number[];
				}[]
			};
		}

		const headerLabels = (() => {
			if (isAnnualRange) {
				const years = new Set<number>();
				for (const transaction of transactions) {
					const parsed = fromYearMonthInt(transaction.date);
					if (parsed) years.add(parsed.year);
				}
				return Array.from(years)
					.sort((a, b) => a - b)
					.map((year) => String(year));
			}
			const labelsByDate = new Map<number, string>();
			for (const transaction of transactions) {
				if (!labelsByDate.has(transaction.date)) labelsByDate.set(transaction.date, transaction.monthLabel);
			}
			return Array.from(labelsByDate.entries())
				.sort((a, b) => a[0] - b[0])
				.map((entry) => entry[1]);
		})();

		const headerIndexByLabel = new Map<string, number>();
		headerLabels.forEach((label, index) => headerIndexByLabel.set(label, index));
		const rowMap = new Map<
			string,
			{
				assetName: string;
				accountName: string;
				type: string;
				category: string;
				description: string;
				values: number[];
			}
		>();

		for (const transaction of transactions) {
			const label = isAnnualRange
				? String(fromYearMonthInt(transaction.date)?.year ?? '')
				: transaction.monthLabel;
			const headerIndex = headerIndexByLabel.get(label);
			if (headerIndex === undefined) continue;
			const assetName = transaction.assetName ?? '';
			const accountName = transaction.accountName ?? '';
			const type = formatLabel(transaction.cashflowType);
			const category = formatLabel(transaction.category);
			const description = (transaction.description ?? '').trim();
			const rowKey = [assetName, accountName, type, category, description].join('|');
			const row =
				rowMap.get(rowKey) ??
				{
					assetName,
					accountName,
					type,
					category,
					description,
					values: Array(headerLabels.length).fill(0)
				};
			row.values[headerIndex] += transaction.amount;
			rowMap.set(rowKey, row);
		}

		const rows = Array.from(rowMap.values()).sort((a, b) => {
			const primaryDiff = (a[transactionSortKey] ?? '').localeCompare(b[transactionSortKey] ?? '');
			if (primaryDiff !== 0) return transactionSortDirection === 'asc' ? primaryDiff : -primaryDiff;
			const assetDiff = a.assetName.localeCompare(b.assetName);
			if (assetDiff !== 0) return assetDiff;
			const accountDiff = a.accountName.localeCompare(b.accountName);
			if (accountDiff !== 0) return accountDiff;
			const typeDiff = a.type.localeCompare(b.type);
			if (typeDiff !== 0) return typeDiff;
			const categoryDiff = a.category.localeCompare(b.category);
			if (categoryDiff !== 0) return categoryDiff;
			return a.description.localeCompare(b.description);
		});
		const totalValues = Array(headerLabels.length).fill(0);
		for (const row of rows) {
			row.values.forEach((value, idx) => {
				totalValues[idx] += value;
			});
		}
		return { headers: headerLabels, totalValues, rows };
	})();

	const profitLossTree = (() => {
		if (chartProjection.transactions.length === 0) return [];
		const headers = chartAxisPoints.map((point: any) => point.monthLabel);
		const indexByLabel = new Map<string, number>();
		headers.forEach((label: string, index: number) => indexByLabel.set(label, index));

		const buildMaps = () => new Map<string, Map<string, Map<string, number[]>>>();
		const incomeMap = buildMaps();
		const expenseMap = buildMaps();

		for (const transaction of chartProjection.transactions) {
			if (transaction.cashflowType === 'transfer') continue;
			const label =
				projectionRange === '10y' || projectionRange === 'all'
					? String(fromYearMonthInt(transaction.date)?.year ?? '')
					: transaction.monthLabel;
			const idx = indexByLabel.get(label);
			if (idx === undefined) continue;

			const targetMap = transaction.cashflowType === 'income' ? incomeMap : expenseMap;
			const accountName = transaction.accountName;
			const category = formatLabel(transaction.category);
			const description = (transaction.description ?? '').trim();

			const categoryMap = targetMap.get(accountName) ?? new Map<string, Map<string, number[]>>();
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
				for (const category of Array.from(categoryMap.keys()).sort((a, b) => a.localeCompare(b))) {
					const descMap = categoryMap.get(category)!;
					const descNodes: PnlNode[] = [];
					const descTotals: number[][] = [];
					const noDescriptionTotals: number[] = Array(headers.length).fill(0);
					for (const description of Array.from(descMap.keys()).sort((a, b) => a.localeCompare(b))) {
						const values = descMap.get(description)!;
						if (!description) {
							values.forEach((value, idx) => {
								noDescriptionTotals[idx] += value;
							});
							continue;
						}
						descTotals.push(values);
						descNodes.push({
							id: `${accountName}|${category}|${description}`,
							label: description,
							level: 3,
							values
						});
					}
					const categoryValues = sumArrays(
						noDescriptionTotals.some((value) => value !== 0)
							? [...descTotals, noDescriptionTotals]
							: descTotals,
						headers.length
					);
					categoryTotals.push(categoryValues);
					categoryNodes.push({
						id: `${accountName}|${category}`,
						label: category,
						level: 2,
						values: categoryValues,
						children: descNodes.length > 0 ? descNodes : undefined
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
			{ id: 'net', label: 'Net', level: 0, values: netTotals },
			{ id: 'income', label: 'Income', level: 0, values: incomeTotals, children: incomeAccounts },
			{ id: 'expenses', label: 'Expenses', level: 0, values: expenseTotals, children: expenseAccounts }
		] as PnlNode[];
	})();

	const profitLossRows = flattenPnl(profitLossTree, expandedPnlNodes);
	const pnlExpandableNodeIds = (() => {
		const ids: string[] = [];
		const walk = (nodes: PnlNode[]) => {
			for (const node of nodes) {
				if (!node.children?.length) continue;
				ids.push(node.id);
				walk(node.children);
			}
		};
		walk(profitLossTree);
		return ids;
	})();
	const isAllPnlExpanded =
		pnlExpandableNodeIds.length > 0 &&
		pnlExpandableNodeIds.every((id) => expandedPnlNodes.has(id));

	return {
		chartProjection,
		totalSeries,
		balanceExtent,
		chartAxisPoints,
		balanceSheetHeaders,
		balanceSheetRows,
		transactionPivot,
		profitLossRows,
		pnlExpandableNodeIds,
		isAllPnlExpanded
	};
};

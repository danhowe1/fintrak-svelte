import { fromYearMonthInt } from '$lib/yearMonth';
import type { ProjectionRange } from '$lib/dashboard/types';
import type { ProjectionResult } from '$lib/server/projection';

export type ScenarioProjectionEntry = {
	scenarioId: string;
	scenarioName: string;
	projection: ProjectionResult;
};

export type ScenarioProjectionBalanceSource = 'net_worth' | 'liquidity';

type ComparisonPoint = {
	date: number;
	monthLabel: string;
	balance: number;
};

type ComparisonSeries = {
	id: string;
	name: string;
	points: ComparisonPoint[];
};

type ProfitLossRow = {
	id: string;
	name: string;
	type: 'net';
	values: number[];
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

const clipPointsByRange = <T extends { date: number }>(
	points: T[],
	rangeEndDate: number | null
) => {
	if (rangeEndDate === null) return points;
	return points.filter((point) => point.date <= rangeEndDate);
};

const clipTransactionsByRange = (
	transactions: ProjectionResult['transactions'],
	rangeEndDate: number | null
) => {
	if (rangeEndDate === null) return transactions;
	return transactions.filter((transaction) => transaction.date <= rangeEndDate);
};

const getAnnualPoints = (points: ComparisonPoint[]) => {
	const byYear = new Map<number, ComparisonPoint>();
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

const getTotalBalancePoints = (projection: ProjectionResult): ComparisonPoint[] => {
	const totalsByDate = new Map<number, ComparisonPoint>();
	for (const account of projection.accounts ?? []) {
		for (const point of account.points ?? []) {
			const existing = totalsByDate.get(point.date);
			if (existing) {
				existing.balance += point.balance;
			} else {
				totalsByDate.set(point.date, { ...point });
			}
		}
	}
	for (const asset of projection.assets ?? []) {
		for (const point of asset.points ?? []) {
			const existing = totalsByDate.get(point.date);
			if (existing) {
				existing.balance += point.value;
			} else {
				totalsByDate.set(point.date, {
					date: point.date,
					monthLabel: point.monthLabel,
					balance: point.value
				});
			}
		}
	}
	return Array.from(totalsByDate.values()).sort((a, b) => a.date - b.date);
};

const getTotalLiquidityPoints = (projection: ProjectionResult): ComparisonPoint[] => {
	const liquidityPoints = (projection.liquidity?.points ?? []).map((point) => ({
		date: point.date,
		monthLabel: point.monthLabel,
		balance: point.balance
	}));
	if (liquidityPoints.length > 0) {
		return liquidityPoints;
	}

	const totalsByDate = new Map<number, ComparisonPoint>();
	for (const series of projection.liquidity?.series ?? []) {
		for (const point of series.points ?? []) {
			const existing = totalsByDate.get(point.date);
			if (existing) {
				existing.balance += point.balance;
			} else {
				totalsByDate.set(point.date, {
					date: point.date,
					monthLabel: point.monthLabel,
					balance: point.balance
				});
			}
		}
	}
	return Array.from(totalsByDate.values()).sort((a, b) => a.date - b.date);
};

const getAxisDates = (seriesList: ComparisonSeries[]) => {
	const dates = new Set<number>();
	for (const series of seriesList) {
		for (const point of series.points) {
			dates.add(point.date);
		}
	}
	return Array.from(dates).sort((a, b) => a - b);
};

const getBalanceExtent = (rows: Array<Array<number | null>>) => {
	const values = rows.flatMap((row) => row.filter((value): value is number => value !== null));
	if (!values.length) return { min: 0, max: 1 };
	const min = Math.min(...values, 0);
	const max = Math.max(...values, 0);
	return { min, max: max === min ? min + 1 : max };
};

export const buildScenarioProjectionComparison = (input: {
	scenarioProjections: ScenarioProjectionEntry[];
	projectionRange: ProjectionRange;
	projectionBalanceSource: ScenarioProjectionBalanceSource;
}) => {
	const { scenarioProjections, projectionRange, projectionBalanceSource } = input;
	const isAnnualRange = projectionRange === '10y' || projectionRange === 'all';

	const balanceSeries = scenarioProjections.map((entry) => {
		const rangeEndDate = getRangeEndDate(entry.projection.startDate, projectionRange);
		const sourcePoints =
			projectionBalanceSource === 'liquidity'
				? getTotalLiquidityPoints(entry.projection)
				: getTotalBalancePoints(entry.projection);
		const clippedPoints = clipPointsByRange(sourcePoints, rangeEndDate);
		return {
			id: entry.scenarioId,
			name: entry.scenarioName,
			points: isAnnualRange ? getAnnualPoints(clippedPoints) : clippedPoints
		} satisfies ComparisonSeries;
	});

	const balanceAxisDates = getAxisDates(balanceSeries);
	const balanceAxisPointByDate = new Map<number, string>();
	for (const series of balanceSeries) {
		for (const point of series.points) {
			if (!balanceAxisPointByDate.has(point.date)) {
				balanceAxisPointByDate.set(
					point.date,
					isAnnualRange ? String(fromYearMonthInt(point.date)?.year ?? '') : point.monthLabel
				);
			}
		}
	}
	const balanceSheetHeaders = balanceAxisDates.map(
		(date) => balanceAxisPointByDate.get(date) ?? ''
	);
	const balanceSheetRows = balanceSeries.map((series) => {
		const valueByDate = new Map(series.points.map((point) => [point.date, point.balance] as const));
		return {
			name: series.name,
			values: balanceAxisDates.map((date) => valueByDate.get(date) ?? null)
		};
	});

	const pnlTotalsByScenario = scenarioProjections.map((entry) => {
		const rangeEndDate = getRangeEndDate(entry.projection.startDate, projectionRange);
		const transactions = clipTransactionsByRange(
			entry.projection.transactions ?? [],
			rangeEndDate
		).filter((transaction) => transaction.cashflowType !== 'transfer');
		return {
			scenarioId: entry.scenarioId,
			scenarioName: entry.scenarioName,
			transactions
		};
	});

	const pnlDateSet = new Set<number>();
	for (const scenario of pnlTotalsByScenario) {
		for (const transaction of scenario.transactions) {
			if (isAnnualRange) {
				const year = fromYearMonthInt(transaction.date)?.year;
				if (year) {
					pnlDateSet.add(year * 100 + 12);
				}
			} else {
				pnlDateSet.add(transaction.date);
			}
		}
	}
	const pnlAxisDates = Array.from(pnlDateSet).sort((a, b) => a - b);
	const pnlHeaders = pnlAxisDates.map((date) =>
		isAnnualRange
			? String(fromYearMonthInt(date)?.year ?? '')
			: (balanceAxisPointByDate.get(date) ?? '')
	);

	const profitLossRows: ProfitLossRow[] = [];
	for (const scenario of pnlTotalsByScenario) {
		const netValues = Array(pnlAxisDates.length).fill(0);
		const pnlIndexByDate = new Map(pnlAxisDates.map((date, index) => [date, index] as const));

		for (const transaction of scenario.transactions) {
			const bucketDate = isAnnualRange
				? (fromYearMonthInt(transaction.date)?.year ?? 0) * 100 + 12
				: transaction.date;
			const bucketIndex = pnlIndexByDate.get(bucketDate);
			if (bucketIndex === undefined) continue;
			if (transaction.cashflowType === 'income') {
				netValues[bucketIndex] += transaction.amount;
			} else if (transaction.cashflowType === 'expense') {
				netValues[bucketIndex] += transaction.amount;
			}
		}

		profitLossRows.push({
			id: `${scenario.scenarioId}:net`,
			name: `${scenario.scenarioName} Net`,
			type: 'net',
			values: netValues
		});
	}

	return {
		balanceChart: {
			labels: balanceSheetHeaders,
			series: balanceSheetRows
		},
		balanceSheetHeaders,
		balanceSheetRows,
		profitLossHeaders: pnlHeaders,
		profitLossRows,
		balanceExtent: getBalanceExtent(balanceSheetRows.map((row) => row.values))
	};
};

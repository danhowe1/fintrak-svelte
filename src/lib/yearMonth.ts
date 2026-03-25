export type YearMonth = {
	year: number;
	month: number;
};

const isValidYearMonth = (year: number, month: number) =>
	Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12;

export const fromYearMonthInt = (value: number): YearMonth | null => {
	if (!Number.isFinite(value)) return null;
	const year = Math.floor(value / 100);
	const month = value % 100;
	if (!isValidYearMonth(year, month)) return null;
	return { year, month };
};

export const toYearMonthInt = (value: YearMonth) => value.year * 100 + value.month;

export const parseYearMonthInput = (value: string): number | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;

	let match = trimmed.match(/^(\d{4})-(\d{2})/);
	if (match) {
		const year = Number(match[1]);
		const month = Number(match[2]);
		return isValidYearMonth(year, month) ? toYearMonthInt({ year, month }) : null;
	}

	match = trimmed.match(/^(\d{2})[\s/-]?(\d{4})$/);
	if (match) {
		const month = Number(match[1]);
		const year = Number(match[2]);
		return isValidYearMonth(year, month) ? toYearMonthInt({ year, month }) : null;
	}

	match = trimmed.match(/^(\d{4})(\d{2})$/);
	if (match) {
		const year = Number(match[1]);
		const month = Number(match[2]);
		return isValidYearMonth(year, month) ? toYearMonthInt({ year, month }) : null;
	}

	return null;
};

export const normalizeYearMonthValue = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return fromYearMonthInt(value) ? value : null;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = parseYearMonthInput(trimmed);
		if (parsed !== null) return parsed;
	}
	if (value instanceof Date) {
		const year = value.getFullYear();
		const month = value.getMonth() + 1;
		return isValidYearMonth(year, month) ? toYearMonthInt({ year, month }) : null;
	}
	return null;
};

export const formatYearMonthLabel = (value: number | YearMonth): string => {
	const resolved = typeof value === 'number' ? fromYearMonthInt(value) : value;
	if (!resolved) return '';
	return `${String(resolved.month).padStart(2, '0')} ${resolved.year}`;
};

export const formatYearMonthInput = (value: unknown): string => {
	const normalized = normalizeYearMonthValue(value);
	if (normalized === null) return '';
	return formatYearMonthLabel(normalized);
};

export const addMonthsToYearMonth = (value: YearMonth, monthsToAdd: number): YearMonth => {
	const total = value.year * 12 + (value.month - 1) + monthsToAdd;
	const year = Math.floor(total / 12);
	const month = (total % 12) + 1;
	return { year, month };
};

export const monthsBetweenYearMonths = (from: YearMonth, to: YearMonth) =>
	(to.year - from.year) * 12 + (to.month - from.month);

export const yearMonthIndex = (value: YearMonth) => value.year * 12 + (value.month - 1);

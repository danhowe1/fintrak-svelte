import type { ProjectionRange } from './types';

export const normalizeProjectionRange = (value: unknown): ProjectionRange => {
	if (value === '1y' || value === '5y' || value === '10y' || value === 'all') return value;
	return 'all';
};

export const isValidMonthYearInput = (value: string) =>
	/^(0[1-9]|1[0-2])(\s|\/|-)?\d{4}$/.test(value.trim());

export const stepForValue = (value: number) => {
	const absValue = Math.abs(value);
	if (absValue <= 1) return 0.25;
	if (absValue <= 100) return 1;
	if (absValue <= 1000) return 100;
	if (absValue <= 10000) return 500;
	if (absValue <= 100000) return 5000;
	if (absValue <= 1000000) return 50000;
	return 500000;
};

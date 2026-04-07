import { describe, expect, it } from 'vitest';
import {
	isValidMonthYearInput,
	normalizeProjectionRange,
	stepForValue
} from '../src/lib/dashboard/ui-helpers';

describe('dashboard ui helpers', () => {
	it('normalizes projection range values', () => {
		expect(normalizeProjectionRange('1y')).toBe('1y');
		expect(normalizeProjectionRange('5y')).toBe('5y');
		expect(normalizeProjectionRange('10y')).toBe('10y');
		expect(normalizeProjectionRange('all')).toBe('all');
		expect(normalizeProjectionRange('invalid')).toBe('all');
		expect(normalizeProjectionRange(null)).toBe('all');
	});

	it('validates month-year input format', () => {
		expect(isValidMonthYearInput('01 2026')).toBe(true);
		expect(isValidMonthYearInput('12/2030')).toBe(true);
		expect(isValidMonthYearInput('07-2040')).toBe(true);
		expect(isValidMonthYearInput('7 2040')).toBe(false);
		expect(isValidMonthYearInput('13 2040')).toBe(false);
		expect(isValidMonthYearInput('00 2040')).toBe(false);
		expect(isValidMonthYearInput('07 40')).toBe(false);
	});

	it('returns expected numeric input step sizes by magnitude', () => {
		expect(stepForValue(0)).toBe(0.25);
		expect(stepForValue(1)).toBe(0.25);
		expect(stepForValue(2)).toBe(1);
		expect(stepForValue(100)).toBe(1);
		expect(stepForValue(101)).toBe(100);
		expect(stepForValue(1000)).toBe(100);
		expect(stepForValue(1001)).toBe(500);
		expect(stepForValue(100000)).toBe(5000);
		expect(stepForValue(100001)).toBe(50000);
		expect(stepForValue(1000001)).toBe(500000);
		expect(stepForValue(-2500)).toBe(500);
	});
});

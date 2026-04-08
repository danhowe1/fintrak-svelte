import { describe, expect, it, vi } from 'vitest';
import { runInitialDashboardLoad } from '../src/lib/dashboard/dashboard-data-orchestrator';

describe('dashboard data orchestrator', () => {
	it('toggles loading flags and clears errors on successful initial load', async () => {
		let state: {
			isInitialWhatIfLoading: boolean;
			isInitialProjectionLoading: boolean;
			whatIfLoadError: string | null;
			projectionError: string | null;
		} = {
			isInitialWhatIfLoading: false,
			isInitialProjectionLoading: false,
			whatIfLoadError: 'old',
			projectionError: 'old'
		};

		await runInitialDashboardLoad({
			loadWhatIf: vi.fn(async () => {}),
			refreshProjection: vi.fn(async () => {}),
			setState: (updater) => {
				state = updater(state);
			}
		});

		expect(state.isInitialWhatIfLoading).toBe(false);
		expect(state.isInitialProjectionLoading).toBe(false);
		expect(state.whatIfLoadError).toBeNull();
		expect(state.projectionError).toBeNull();
	});

	it('captures section-specific errors', async () => {
		let state = {
			isInitialWhatIfLoading: false,
			isInitialProjectionLoading: false,
			whatIfLoadError: null as string | null,
			projectionError: null as string | null
		};

		await runInitialDashboardLoad({
			loadWhatIf: vi.fn(async () => {
				throw new Error('what-if failed');
			}),
			refreshProjection: vi.fn(async () => {
				throw new Error('projection failed');
			}),
			setState: (updater) => {
				state = updater(state);
			}
		});

		expect(state.whatIfLoadError).toBe('what-if failed');
		expect(state.projectionError).toBe('projection failed');
	});
});

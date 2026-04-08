import {
	parseDashboardProjectionResponse,
	parseDashboardWhatIfResponse,
	type DashboardProjectionResponse,
	type DashboardWhatIfResponse
} from '$lib/dashboard/contracts';

type InitialLoadState = {
	isInitialWhatIfLoading: boolean;
	isInitialProjectionLoading: boolean;
	whatIfLoadError: string | null;
	projectionError: string | null;
};

const parseError = (error: unknown, fallback: string) =>
	error instanceof Error ? error.message : fallback;

export const fetchDashboardWhatIf = async (scenarioId: string): Promise<DashboardWhatIfResponse> => {
	const url = new URL('/dashboard/data/what-if', window.location.origin);
	url.searchParams.set('scenarioId', scenarioId);
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error('Unable to load What-if data.');
	}
	return parseDashboardWhatIfResponse(await response.json());
};

export const fetchDashboardProjection = async (
	scenarioId: string,
	options?: { includeCashflows?: boolean }
): Promise<DashboardProjectionResponse> => {
	const url = new URL('/dashboard/projection', window.location.origin);
	url.searchParams.set('scenarioId', scenarioId);
	if (options?.includeCashflows) {
		url.searchParams.set('includeCashflows', 'true');
	}
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error('Unable to refresh the projection. Please try again.');
	}
	return parseDashboardProjectionResponse(await response.json());
};

export const runInitialDashboardLoad = async (args: {
	refreshProjection: () => Promise<void>;
	loadWhatIf: () => Promise<void>;
	setState: (updater: (state: InitialLoadState) => InitialLoadState) => void;
}) => {
	args.setState((state) => ({
		...state,
		isInitialWhatIfLoading: true,
		isInitialProjectionLoading: true,
		whatIfLoadError: null,
		projectionError: null
	}));

	const [whatIfResult, projectionResult] = await Promise.allSettled([
		args.loadWhatIf(),
		args.refreshProjection()
	]);

	args.setState((state) => ({
		...state,
		isInitialWhatIfLoading: false,
		isInitialProjectionLoading: false,
		whatIfLoadError:
			whatIfResult.status === 'rejected'
				? parseError(whatIfResult.reason, 'Unable to load What-if data.')
				: null,
		projectionError:
			projectionResult.status === 'rejected'
				? parseError(projectionResult.reason, 'Unable to refresh the projection.')
				: state.projectionError
	}));
};

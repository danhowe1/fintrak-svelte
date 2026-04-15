import {
	parseDashboardReloadResponse,
	parseDashboardProjectionResponse,
	parseDashboardWhatIfResponse,
	type DashboardReloadResponse,
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

export const fetchDashboardWhatIf = async (
	scenarioId: string
): Promise<DashboardWhatIfResponse> => {
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

export const fetchDashboardReload = async (
	scenarioId: string
): Promise<DashboardReloadResponse> => {
	const url = new URL('/dashboard/data/reload', window.location.origin);
	url.searchParams.set('scenarioId', scenarioId);
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error('Unable to refresh the dashboard. Please try again.');
	}
	return parseDashboardReloadResponse(await response.json());
};

export const runInitialDashboardLoad = async (args: {
	refreshProjection?: () => Promise<void>;
	loadWhatIf: () => Promise<void>;
	setState: (updater: (state: InitialLoadState) => InitialLoadState) => void;
}) => {
	args.setState((state) => ({
		...state,
		isInitialWhatIfLoading: true,
		isInitialProjectionLoading: Boolean(args.refreshProjection),
		whatIfLoadError: null,
		projectionError: null
	}));

	const pendingLoads: Promise<unknown>[] = [];

	if (args.refreshProjection) {
		const projectionLoad = args
			.refreshProjection()
			.then(() => {
				args.setState((state) => ({
					...state,
					isInitialProjectionLoading: false,
					projectionError: null
				}));
			})
			.catch((error) => {
				args.setState((state) => ({
					...state,
					isInitialProjectionLoading: false,
					projectionError: parseError(error, 'Unable to refresh the projection.')
				}));
			});
		pendingLoads.push(projectionLoad);
	}

	const whatIfLoad = args
		.loadWhatIf()
		.then(() => {
			args.setState((state) => ({
				...state,
				isInitialWhatIfLoading: false,
				whatIfLoadError: null
			}));
		})
		.catch((error) => {
			args.setState((state) => ({
				...state,
				isInitialWhatIfLoading: false,
				whatIfLoadError: parseError(error, 'Unable to load What-if data.')
			}));
		});
	pendingLoads.push(whatIfLoad);

	await Promise.allSettled(pendingLoads);
};

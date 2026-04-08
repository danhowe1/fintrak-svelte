export type ActionPayload = Record<string, unknown>;

export const unwrapActionPayload = (payload: unknown): ActionPayload => {
	if (payload && typeof payload === 'object' && 'data' in payload) {
		return (payload as { data?: ActionPayload }).data ?? {};
	}
	return (payload as ActionPayload) ?? {};
};

export const toErrorMessage = (value: unknown, fallback: string): string => {
	if (typeof value === 'string' && value.trim().length > 0) return value;
	if (value && typeof value === 'object') {
		const candidate =
			'value' in value && typeof (value as { value?: unknown }).value === 'string'
				? (value as { value: string }).value
				: 'message' in value && typeof (value as { message?: unknown }).message === 'string'
					? (value as { message: string }).message
					: '';
		if (candidate.trim().length > 0) return candidate;
	}
	return fallback;
};

export const getPayloadErrorMessage = (payload: any, fallback: string): string =>
	toErrorMessage(payload?.error ?? payload?.data?.error ?? payload?.message, fallback);

export const getThrownErrorMessage = (error: unknown, fallback: string): string =>
	error instanceof Error
		? toErrorMessage(error.message, fallback)
		: toErrorMessage(error, fallback);

export const postAction = async (
	actionName: string,
	formData: FormData,
	fallbackErrorMessage: string
): Promise<ActionPayload> => {
	const response = await fetch(`?/${actionName}`, {
		method: 'POST',
		body: formData,
		headers: { accept: 'application/json' }
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(getPayloadErrorMessage(payload, fallbackErrorMessage));
	}
	return unwrapActionPayload(payload);
};

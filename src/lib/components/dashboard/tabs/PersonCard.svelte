<script lang="ts">
	import DisclosureToggle from '$lib/components/ui/DisclosureToggle.svelte';
	import CashflowDraftForm from '$lib/components/dashboard/CashflowDraftForm.svelte';
	import type {
		AssetListItem,
		AssetsTabPersonProps,
		AssetsTabCashflowProps,
		AssetsTabSuperProps,
		AssetsTabUiProps
	} from './types';

	let {
		asset,
		person,
		cashflow,
		superannuation,
		ui,
		assetsList,
		setAssetsList,
		requestDeleteAsset
	}: {
		asset: AssetListItem;
		person: AssetsTabPersonProps;
		cashflow: AssetsTabCashflowProps;
		superannuation: AssetsTabSuperProps;
		ui: AssetsTabUiProps;
		assetsList: AssetListItem[];
		setAssetsList: (next: AssetListItem[]) => void;
		requestDeleteAsset: (id: string, name: string) => void;
	} = $props();

	let editingCashflowIds = $state<Set<string>>(new Set());
	$effect(() => {
		editingCashflowIds = cashflow.editingCashflowIds;
	});

	const personDetails = $derived(person.personDetails);
	const personRetirementAges = $derived(person.personRetirementAges);
	const setPersonRetirementAge = $derived(person.setPersonRetirementAge);
	const updateRetirementAge = $derived(person.updateRetirementAge);
	const expandedPersonDetailIds = $derived(person.expandedPersonDetailIds);
	const togglePersonDetails = $derived(person.togglePersonDetails);
	const personDetailsErrors = $derived(person.personDetailsErrors);
	const isValidMonthYear = $derived(person.isValidMonthYear);
	const setPersonDetails = $derived(person.setPersonDetails);
	const setPersonDetailsError = $derived(person.setPersonDetailsError);
	const updatePersonDetails = $derived(person.updatePersonDetails);

	const cashflowsByAssetId = $derived(cashflow.cashflowsByAssetId);
	const cashflowAmounts = $derived(cashflow.cashflowAmounts);
	const setCashflowAmount = $derived(cashflow.setCashflowAmount);
	const updateCashflowAmount = $derived(cashflow.updateCashflowAmount);
	const openCashflowFormForEdit = $derived(cashflow.openCashflowFormForEdit);
	const requestDeleteCashflow = $derived(cashflow.requestDeleteCashflow);
	const openCashflowForm = $derived(cashflow.openCashflowForm);
	const activeCashflowForm = $derived(cashflow.activeCashflowForm);
	const getDraftKey = $derived(cashflow.getDraftKey);
	const cashflowDrafts = $derived(cashflow.cashflowDrafts);
	const getCategoryOptionsFor = $derived(cashflow.getCategoryOptionsFor);
	const cashflowFrequencyOptions = $derived(cashflow.cashflowFrequencyOptions);
	const getAssetAccountOptions = $derived(cashflow.getAssetAccountOptions);
	const cashflowFormErrors = $derived(cashflow.cashflowFormErrors);
	const setCashflowDraft = $derived(cashflow.setCashflowDraft);
	const closeCashflowForm = $derived(cashflow.closeCashflowForm);
	const updateAssetCashflow = $derived(cashflow.updateAssetCashflow);
	const createAssetCashflow = $derived(cashflow.createAssetCashflow);

	const superDetails = $derived(superannuation.superDetails);
	const setSuperDetails = $derived(superannuation.setSuperDetails);
	const updateSuperannuationDetails = $derived(superannuation.updateSuperannuationDetails);

	// svelte-ignore state_referenced_locally
	let { stepForValue, scheduleUpdate, formatLabel, roundToTwo, formatRate } = ui;

	const updateCashflowDraftAndPersist = (
		assetId: string,
		draftKey: string,
		draft: (typeof cashflowDrafts)[string],
		cashflowId: string | undefined,
		updates: Partial<(typeof cashflowDrafts)[string]>
	) => {
		setCashflowDraft(draftKey, updates);
		if (!cashflowId) return;
		const nextDraft = { ...draft, ...updates };
		scheduleUpdate(`cashflow-edit:${cashflowId}`, () =>
			updateAssetCashflow(assetId, cashflowId, nextDraft, { closeFormOnSuccess: false })
		);
	};

	const toggleCashflowEditForm = (
		assetId: string,
		cf: (typeof cashflowsByAssetId)[string][number]
	) => {
		if (activeCashflowForm?.assetId === assetId && activeCashflowForm.cashflowId === cf.id) {
			closeCashflowForm();
			return;
		}
		openCashflowFormForEdit(assetId, cf);
	};
</script>

<div class="flex w-full flex-col gap-3">
	<div class="app-card-muted w-full">
		<div class="flex items-center justify-between gap-2">
			<h3 class="app-title-sm">
				{personDetails[asset.id]?.name ?? asset.name}
			</h3>
			<button
				type="button"
				class="text-xs font-semibold text-rose-600 hover:text-rose-700"
				onclick={() => requestDeleteAsset(asset.id, personDetails[asset.id]?.name ?? asset.name)}
			>
				Delete
			</button>
		</div>
		<div class="app-hint mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1">
			<span class="truncate text-slate-500">Retirement age</span>
			<input
				id={`retirement-age-input-${asset.id}`}
				type="number"
				class="app-input-compact app-input-compact-lg w-24 justify-self-end"
				value={personRetirementAges[asset.id] ?? ''}
				step={stepForValue(personRetirementAges[asset.id] ?? 0)}
				oninput={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const value = Number.isFinite(next) ? next : 0;
					setPersonRetirementAge(asset.id, value);
					scheduleUpdate(`retirement:${asset.id}`, () => updateRetirementAge(asset.id, value));
				}}
			/>
			<DisclosureToggle
				expanded={expandedPersonDetailIds.has(asset.id)}
				onToggle={() => togglePersonDetails(asset.id)}
			/>
		</div>
		{#if expandedPersonDetailIds.has(asset.id)}
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Start date (MM YYYY)</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="text"
						inputmode="numeric"
						pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
						class="app-input-compact app-input-compact-lg w-24"
						value={personDetails[asset.id]?.startDate ?? ''}
						oninput={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = personDetails[asset.id] ?? {
								name: asset.name,
								startDate: '',
								dob: ''
							};
							setPersonDetails(asset.id, { ...current, startDate: next });
							if (next.trim().length === 0 || isValidMonthYear(next)) {
								setPersonDetailsError(asset.id, 'startDate', '');
							}
						}}
						onchange={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = personDetails[asset.id] ?? {
								name: asset.name,
								startDate: '',
								dob: ''
							};
							if (next.trim().length === 0 || !isValidMonthYear(next)) {
								setPersonDetailsError(asset.id, 'startDate', 'Use MM YYYY format.');
								return;
							}
							if (!current.name.trim()) {
								setPersonDetailsError(asset.id, 'name', 'Name is required.');
								return;
							}
							if (current.dob.trim().length === 0 || !isValidMonthYear(current.dob)) {
								setPersonDetailsError(asset.id, 'dob', 'Use MM YYYY format.');
								return;
							}
							setPersonDetailsError(asset.id, 'startDate', '');
							setPersonDetails(asset.id, { ...current, startDate: next });
							scheduleUpdate(`person-details:${asset.id}`, () =>
								updatePersonDetails(asset.id, current.name, next, current.dob)
							);
						}}
					/>
					{#if personDetailsErrors[asset.id]?.startDate}
						<span class="mt-1 text-[10px] text-rose-600">
							{personDetailsErrors[asset.id]?.startDate}
						</span>
					{/if}
				</div>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Name</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="text"
						class="app-input-compact app-input-compact-lg w-24"
						value={personDetails[asset.id]?.name ?? asset.name}
						oninput={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = personDetails[asset.id] ?? {
								name: asset.name,
								startDate: '',
								dob: ''
							};
							setPersonDetails(asset.id, { ...current, name: next });
							if (next.trim().length > 0) {
								setPersonDetailsError(asset.id, 'name', '');
							}
						}}
						onchange={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value.trim();
							const current = personDetails[asset.id] ?? {
								name: asset.name,
								startDate: '',
								dob: ''
							};
							if (!next) {
								setPersonDetailsError(asset.id, 'name', 'Name is required.');
								return;
							}
							if (
								current.startDate.trim().length === 0 ||
								!isValidMonthYear(current.startDate)
							) {
								setPersonDetailsError(asset.id, 'startDate', 'Use MM YYYY format.');
								return;
							}
							if (current.dob.trim().length === 0 || !isValidMonthYear(current.dob)) {
								setPersonDetailsError(asset.id, 'dob', 'Use MM YYYY format.');
								return;
							}
							setPersonDetailsError(asset.id, 'name', '');
							setPersonDetails(asset.id, { ...current, name: next });
							setAssetsList(assetsList.map((a) => (a.id === asset.id ? { ...a, name: next } : a)));
							scheduleUpdate(`person-details:${asset.id}`, () =>
								updatePersonDetails(asset.id, next, current.startDate, current.dob)
							);
						}}
					/>
					{#if personDetailsErrors[asset.id]?.name}
						<span class="mt-1 text-[10px] text-rose-600">
							{personDetailsErrors[asset.id]?.name}
						</span>
					{/if}
				</div>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Date of birth (MM YYYY)</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="text"
						inputmode="numeric"
						pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
						class="app-input-compact app-input-compact-lg w-24"
						value={personDetails[asset.id]?.dob ?? ''}
						oninput={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = personDetails[asset.id] ?? {
								name: asset.name,
								startDate: '',
								dob: ''
							};
							setPersonDetails(asset.id, { ...current, dob: next });
							if (next.trim().length === 0 || isValidMonthYear(next)) {
								setPersonDetailsError(asset.id, 'dob', '');
							}
						}}
						onchange={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = personDetails[asset.id] ?? {
								name: asset.name,
								startDate: '',
								dob: ''
							};
							if (next.trim().length === 0 || !isValidMonthYear(next)) {
								setPersonDetailsError(asset.id, 'dob', 'Use MM YYYY format.');
								return;
							}
							if (!current.name.trim()) {
								setPersonDetailsError(asset.id, 'name', 'Name is required.');
								return;
							}
							if (
								current.startDate.trim().length === 0 ||
								!isValidMonthYear(current.startDate)
							) {
								setPersonDetailsError(asset.id, 'startDate', 'Use MM YYYY format.');
								return;
							}
							setPersonDetailsError(asset.id, 'dob', '');
							setPersonDetails(asset.id, { ...current, dob: next });
							scheduleUpdate(`person-details:${asset.id}`, () =>
								updatePersonDetails(asset.id, current.name, current.startDate, next)
							);
						}}
					/>
					{#if personDetailsErrors[asset.id]?.dob}
						<span class="mt-1 text-[10px] text-rose-600">
							{personDetailsErrors[asset.id]?.dob}
						</span>
					{/if}
				</div>
				<span></span>
			</div>
		{/if}
		<div class="mt-3 space-y-2">
			{#each cashflowsByAssetId[asset.id] ?? [] as cf}
				<div
					class={`grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs ${
						cf.cashflow_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
					}`}
				>
					<span class="truncate">
						{`${formatLabel(cf.category)} ${cf.description ?? ''}`.trim()}
					</span>
					<input
						id={`cashflow-input-${cf.id}`}
						type="number"
						class="app-input-compact app-input-compact-lg w-24 justify-self-end"
						value={cashflowAmounts[cf.id] ?? cf.amount}
						step={Math.max(stepForValue(cashflowAmounts[cf.id] ?? cf.amount), 0.25)}
						onfocus={() => {
							editingCashflowIds = new Set([...editingCashflowIds, cf.id]);
						}}
						onblur={() => {
							const next = new Set(editingCashflowIds);
							next.delete(cf.id);
							editingCashflowIds = next;
						}}
						oninput={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const value = Number.isFinite(next) ? next : 0;
							setCashflowAmount(cf.id, value);
							scheduleUpdate(`cashflow:${cf.id}`, () => updateCashflowAmount(cf.id, value));
						}}
					/>
					<div class="flex items-center justify-end gap-1">
						<button
							type="button"
							class="text-amber-500 hover:text-amber-600"
							aria-label="Edit cashflow"
							title="Edit cashflow"
							onclick={() => toggleCashflowEditForm(asset.id, cf)}
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-4 w-4"
							>
								<path d="M12 20h9" />
								<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
							</svg>
						</button>
						<button
							type="button"
							class="text-rose-500 hover:text-rose-600"
							aria-label="Delete cashflow"
							title="Delete cashflow"
							onclick={() => requestDeleteCashflow(cf.id)}
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-4 w-4"
							>
								<path d="M3 6h18" />
								<path d="M8 6V4h8v2" />
								<path d="M6 6l1 14h10l1-14" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
							</svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
		<div class="mt-3 flex justify-end gap-2 text-xs font-semibold">
			<button
				type="button"
				class="rounded-full border border-slate-200 bg-white px-3 py-1 text-emerald-700"
				onclick={() => openCashflowForm(asset.id, 'income')}
			>
				Add income
			</button>
			<button
				type="button"
				class="rounded-full border border-slate-200 bg-white px-3 py-1 text-rose-700"
				onclick={() => openCashflowForm(asset.id, 'expense')}
			>
				Add expense
			</button>
		</div>
		{#if activeCashflowForm && activeCashflowForm.assetId === asset.id}
			{@const draftKey = getDraftKey(
				asset.id,
				activeCashflowForm.type,
				activeCashflowForm.cashflowId
			)}
			{@const draft = cashflowDrafts[draftKey]}
			{#if draft}
				<CashflowDraftForm
					{draft}
					isEdit={Boolean(activeCashflowForm.cashflowId)}
					categoryInputId={`cashflow-category-${asset.id}-${activeCashflowForm.type}${
						activeCashflowForm.cashflowId ? `-${activeCashflowForm.cashflowId}` : ''
					}`}
					descriptionInputId={`cashflow-description-${asset.id}-${activeCashflowForm.type}${
						activeCashflowForm.cashflowId ? `-${activeCashflowForm.cashflowId}` : ''
					}`}
					categoryOptions={getCategoryOptionsFor(asset.id, draft.type)}
					frequencyOptions={cashflowFrequencyOptions}
					assetAccountOptions={getAssetAccountOptions(asset.id)}
					error={cashflowFormErrors[asset.id]}
					amountStep={stepForValue(Number(draft.amount) || 0)}
					onUpdate={(updates) =>
						updateCashflowDraftAndPersist(
							asset.id,
							draftKey,
							draft,
							activeCashflowForm.cashflowId,
							updates
						)}
					onDismiss={closeCashflowForm}
					onSubmit={() =>
						activeCashflowForm?.cashflowId
							? updateAssetCashflow(asset.id, activeCashflowForm.cashflowId, draft)
							: createAssetCashflow(asset.id, draft)}
				/>
			{/if}
		{/if}
	</div>
	{#each assetsList.filter((a) => a.asset_type === 'superannuation' && a.person_id === asset.id) as superAsset}
		<div class="app-card-muted w-full">
			<div class="flex items-center justify-between gap-2">
				<h3 class="app-title-sm truncate">
					{superAsset.name}
				</h3>
				<button
					type="button"
					class="text-xs font-semibold text-rose-600 hover:text-rose-700"
					onclick={() => requestDeleteAsset(superAsset.id, superAsset.name)}
				>
					Delete
				</button>
			</div>
			<div class="app-hint mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Preservation age</span>
				<input
					type="number"
					min="0"
					step="1"
					class="app-input-compact app-input-compact-lg w-24 justify-self-end"
					value={superDetails[superAsset.id]?.preservationAge ?? 0}
					oninput={(event) => {
						const next = Number((event.currentTarget as HTMLInputElement).value);
						setSuperDetails(superAsset.id, {
							...(superDetails[superAsset.id] ?? {
								preservationAge: 0,
								capitalGrowthRate: 0,
								managementFeeRate: 0
							}),
							preservationAge: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0
						});
					}}
					onchange={(event) => {
						const next = Number((event.currentTarget as HTMLInputElement).value);
						const current = superDetails[superAsset.id] ?? {
							preservationAge: 0,
							capitalGrowthRate: 0,
							managementFeeRate: 0
						};
						const updated = {
							...current,
							preservationAge: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0
						};
						setSuperDetails(superAsset.id, updated);
						scheduleUpdate(`super:${superAsset.id}`, () =>
							updateSuperannuationDetails(
								superAsset.id,
								updated.preservationAge,
								updated.capitalGrowthRate,
								updated.managementFeeRate
							)
						);
					}}
				/>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Capital growth rate (%)</span>
				<input
					type="number"
					step="0.01"
					class="app-input-compact app-input-compact-lg w-24 justify-self-end"
					value={formatRate(superDetails[superAsset.id]?.capitalGrowthRate ?? 0, 2)}
					oninput={(event) => {
						const next = Number((event.currentTarget as HTMLInputElement).value);
						setSuperDetails(superAsset.id, {
							...(superDetails[superAsset.id] ?? {
								preservationAge: 0,
								capitalGrowthRate: 0,
								managementFeeRate: 0
							}),
							capitalGrowthRate: Number.isFinite(next) ? roundToTwo(next) : 0
						});
					}}
					onchange={(event) => {
						const next = Number((event.currentTarget as HTMLInputElement).value);
						const current = superDetails[superAsset.id] ?? {
							preservationAge: 0,
							capitalGrowthRate: 0,
							managementFeeRate: 0
						};
						const updated = {
							...current,
							capitalGrowthRate: Number.isFinite(next) ? roundToTwo(next) : 0
						};
						setSuperDetails(superAsset.id, updated);
						scheduleUpdate(`super:${superAsset.id}`, () =>
							updateSuperannuationDetails(
								superAsset.id,
								updated.preservationAge,
								updated.capitalGrowthRate,
								updated.managementFeeRate
							)
						);
					}}
				/>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Management fee rate (%)</span>
				<input
					type="number"
					step="0.01"
					class="app-input-compact app-input-compact-lg w-24 justify-self-end"
					value={formatRate(superDetails[superAsset.id]?.managementFeeRate ?? 0, 2)}
					oninput={(event) => {
						const next = Number((event.currentTarget as HTMLInputElement).value);
						setSuperDetails(superAsset.id, {
							...(superDetails[superAsset.id] ?? {
								preservationAge: 0,
								capitalGrowthRate: 0,
								managementFeeRate: 0
							}),
							managementFeeRate: Number.isFinite(next) ? roundToTwo(next) : 0
						});
					}}
					onchange={(event) => {
						const next = Number((event.currentTarget as HTMLInputElement).value);
						const current = superDetails[superAsset.id] ?? {
							preservationAge: 0,
							capitalGrowthRate: 0,
							managementFeeRate: 0
						};
						const updated = {
							...current,
							managementFeeRate: Number.isFinite(next) ? roundToTwo(next) : 0
						};
						setSuperDetails(superAsset.id, updated);
						scheduleUpdate(`super:${superAsset.id}`, () =>
							updateSuperannuationDetails(
								superAsset.id,
								updated.preservationAge,
								updated.capitalGrowthRate,
								updated.managementFeeRate
							)
						);
					}}
				/>
				<span></span>
			</div>
		</div>
	{/each}
</div>

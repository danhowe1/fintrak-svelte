<script lang="ts">
	import DisclosureToggle from '$lib/components/ui/DisclosureToggle.svelte';
	import CashflowDraftForm from '$lib/components/dashboard/CashflowDraftForm.svelte';
	import type {
		AccountListItem,
		AssetAccountLink,
		AssetListItem,
		AssetsTabPropertyProps,
		AssetsTabMortgageProps,
		AssetsTabCashflowProps,
		AssetsTabUiProps
	} from './types';

	let {
		asset,
		property,
		mortgage,
		cashflow,
		ui,
		assetsList,
		setAssetsList,
		accountsList,
		setAccountsList,
		assetAccountsList,
		isValidMonthYear,
		requestDeleteAsset
	}: {
		asset: AssetListItem;
		property: AssetsTabPropertyProps;
		mortgage: AssetsTabMortgageProps;
		cashflow: AssetsTabCashflowProps;
		ui: AssetsTabUiProps;
		assetsList: AssetListItem[];
		setAssetsList: (next: AssetListItem[]) => void;
		accountsList: AccountListItem[];
		setAccountsList: (next: AccountListItem[]) => void;
		assetAccountsList: AssetAccountLink[];
		isValidMonthYear: (value: string) => boolean;
		requestDeleteAsset: (id: string, name: string) => void;
	} = $props();

	let editingCashflowIds = $state<Set<string>>(new Set());
	$effect(() => {
		editingCashflowIds = cashflow.editingCashflowIds;
	});

	const propertyDetails = $derived(property.propertyDetails);
	const propertyErrors = $derived(property.propertyErrors);
	const expandedPropertyDetailIds = $derived(property.expandedPropertyDetailIds);
	const togglePropertyDetails = $derived(property.togglePropertyDetails);
	const setPropertyDetails = $derived(property.setPropertyDetails);
	const setPropertyError = $derived(property.setPropertyError);
	const updatePropertyDetails = $derived(property.updatePropertyDetails);

	const mortgageDetails = $derived(mortgage.mortgageDetails);
	const mortgageErrors = $derived(mortgage.mortgageErrors);
	const expandedMortgageDetailIds = $derived(mortgage.expandedMortgageDetailIds);
	const toggleMortgageDetails = $derived(mortgage.toggleMortgageDetails);
	const setMortgageDetails = $derived(mortgage.setMortgageDetails);
	const setMortgageError = $derived(mortgage.setMortgageError);
	const updateMortgageDetails = $derived(mortgage.updateMortgageDetails);
	const validateMortgageDetails = $derived(mortgage.validateMortgageDetails);

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

	// svelte-ignore state_referenced_locally
	let { stepForValue, scheduleUpdate, formatLabel, formatRate, formatYearMonthInput } = ui;

	const getPropertyUse = (propertyAsset: AssetListItem) => {
		const rawPropertyUse = propertyAsset.details?.propertyUse;
		if (rawPropertyUse === 'primary_residence' || rawPropertyUse === 'investment_property') {
			return rawPropertyUse;
		}
		const propertyCount = assetsList.filter((a) => a.asset_type === 'property').length;
		return propertyCount === 1 ? 'primary_residence' : 'investment_property';
	};

	const getPropertyDraft = (propertyAsset: AssetListItem) =>
		propertyDetails[propertyAsset.id] ?? {
			name: propertyAsset.name,
			startDate: formatYearMonthInput(propertyAsset.start_date),
			propertyUse: getPropertyUse(propertyAsset),
			marketValue: Number(propertyAsset.details?.marketValue) || 0,
			marketGrowthRate: 0,
			saleDate: '',
			fixedSellingCosts: Number(propertyAsset.details?.fixedSellingCosts) || 0,
			variableSellingCosts: Number(propertyAsset.details?.variableSellingCosts) || 0
		};

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
				{propertyDetails[asset.id]?.name ?? asset.name}
			</h3>
			<button
				type="button"
				class="text-xs font-semibold text-rose-600 hover:text-rose-700"
				onclick={() =>
					requestDeleteAsset(asset.id, propertyDetails[asset.id]?.name ?? asset.name)}
			>
				Delete
			</button>
		</div>
		<div class="app-hint mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1">
			<span class="truncate text-slate-500">Market growth rate</span>
			<input
				type="number"
				class="app-input-compact app-input-compact-lg w-24 justify-self-end"
				value={formatRate(propertyDetails[asset.id]?.marketGrowthRate ?? 0, 1)}
				step="0.5"
				oninput={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const current = getPropertyDraft(asset);
					setPropertyDetails(asset.id, {
						...current,
						marketGrowthRate: Number.isFinite(next) ? next : 0
					});
				}}
				onchange={(event) => {
					const next = Number((event.currentTarget as HTMLInputElement).value);
					const current = getPropertyDraft(asset);
					const value = Number.isFinite(next) ? next : 0;
					setPropertyDetails(asset.id, { ...current, marketGrowthRate: value });
					scheduleUpdate(`property:${asset.id}`, () =>
						updatePropertyDetails(
							asset.id,
							current.name,
							current.startDate,
							current.propertyUse,
							current.marketValue ?? 0,
							value,
							current.saleDate ?? '',
							current.fixedSellingCosts ?? 0,
							current.variableSellingCosts ?? 0
						)
					);
				}}
			/>
			<span></span>
		</div>
		<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
			<span class="truncate text-slate-500">Sale date (MM YYYY)</span>
			<div class="flex flex-col items-end justify-self-end">
				<input
					id={`property-sale-date-input-${asset.id}`}
					type="text"
					inputmode="numeric"
					pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
					class="app-input-compact app-input-compact-lg w-24"
					value={propertyDetails[asset.id]?.saleDate ?? ''}
					oninput={(event) => {
						const next = (event.currentTarget as HTMLInputElement).value;
						const current = getPropertyDraft(asset);
						setPropertyDetails(asset.id, { ...current, saleDate: next });
						if (next.trim().length === 0 || isValidMonthYear(next)) {
							setPropertyError(asset.id, 'saleDate', '');
						}
					}}
					onchange={(event) => {
						const next = (event.currentTarget as HTMLInputElement).value;
						const current = getPropertyDraft(asset);
						if (next.trim().length > 0 && !isValidMonthYear(next)) {
							setPropertyError(asset.id, 'saleDate', 'Use MM YYYY format.');
							return;
						}
						setPropertyError(asset.id, 'saleDate', '');
						setPropertyDetails(asset.id, { ...current, saleDate: next });
						scheduleUpdate(`property:${asset.id}`, () =>
							updatePropertyDetails(
								asset.id,
								current.name,
								current.startDate,
								current.propertyUse,
								current.marketValue ?? 0,
								current.marketGrowthRate ?? 0,
								next,
								current.fixedSellingCosts ?? 0,
								current.variableSellingCosts ?? 0
							)
						);
					}}
				/>
				{#if propertyErrors[asset.id]?.saleDate}
					<span class="mt-1 text-[10px] text-rose-600">
						{propertyErrors[asset.id]?.saleDate}
					</span>
				{/if}
			</div>
			<DisclosureToggle
				expanded={expandedPropertyDetailIds.has(asset.id)}
				onToggle={() => togglePropertyDetails(asset.id)}
			/>
		</div>
		{#if expandedPropertyDetailIds.has(asset.id)}
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Property type</span>
				<div class="flex flex-col items-end justify-self-end">
					<select
						class="app-input-compact app-input-compact-lg w-24"
						value={propertyDetails[asset.id]?.propertyUse ?? getPropertyUse(asset)}
						onchange={(event) => {
							const next = (event.currentTarget as HTMLSelectElement).value as
								| 'primary_residence'
								| 'investment_property';
							const current = getPropertyDraft(asset);
							const updatedProperties = Object.fromEntries(
								Object.entries(propertyDetails).map(([assetId, detail]) => [
									assetId,
									{
										...detail,
										propertyUse:
											next === 'primary_residence' && assetId !== asset.id
												? 'investment_property'
												: detail.propertyUse
									}
								])
							);
							if (next === 'primary_residence') {
								for (const [assetId, detail] of Object.entries(updatedProperties)) {
									setPropertyDetails(assetId, detail);
								}
							}
							setPropertyDetails(asset.id, { ...current, propertyUse: next });
							setAssetsList(
								assetsList.map((a) =>
									a.asset_type === 'property'
										? {
												...a,
												details: {
													...a.details,
													propertyUse:
														next === 'primary_residence' && a.id === asset.id
															? 'primary_residence'
															: a.id === asset.id
																? next
																: a.details?.propertyUse === 'primary_residence'
																	? 'investment_property'
																	: a.details?.propertyUse
												}
											}
										: a
								)
							);
							scheduleUpdate(`property:${asset.id}`, () =>
								updatePropertyDetails(
									asset.id,
									current.name,
									current.startDate,
									next,
									current.marketValue,
									current.marketGrowthRate,
									current.saleDate ?? '',
									current.fixedSellingCosts,
									current.variableSellingCosts
								)
							);
						}}
					>
						<option value="primary_residence">Primary</option>
						<option value="investment_property">Investment</option>
					</select>
				</div>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Start date (MM YYYY)</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="text"
						inputmode="numeric"
						pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
						class="app-input-compact app-input-compact-lg w-24"
						value={propertyDetails[asset.id]?.startDate ?? ''}
						oninput={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = propertyDetails[asset.id];
							if (!current) return;
							setPropertyDetails(asset.id, { ...current, startDate: next });
							if (next.trim().length > 0 && isValidMonthYear(next)) {
								setPropertyError(asset.id, 'startDate', '');
							}
						}}
						onchange={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = propertyDetails[asset.id];
							if (!current) return;
							if (!isValidMonthYear(next)) {
								setPropertyError(asset.id, 'startDate', 'Use MM YYYY format.');
								return;
							}
							setPropertyError(asset.id, 'startDate', '');
							setPropertyDetails(asset.id, { ...current, startDate: next });
							scheduleUpdate(`property:${asset.id}`, () =>
								updatePropertyDetails(
									asset.id,
									current.name,
									next,
									current.propertyUse,
									current.marketValue,
									current.marketGrowthRate,
									current.saleDate ?? '',
									current.fixedSellingCosts,
									current.variableSellingCosts
								)
							);
						}}
					/>
					{#if propertyErrors[asset.id]?.startDate}
						<span class="mt-1 text-[10px] text-rose-600">
							{propertyErrors[asset.id]?.startDate}
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
						value={propertyDetails[asset.id]?.name ?? asset.name}
						oninput={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value;
							const current = propertyDetails[asset.id];
							if (!current) return;
							setPropertyDetails(asset.id, { ...current, name: next });
							if (next.trim().length > 0) {
								setPropertyError(asset.id, 'name', '');
							}
						}}
						onchange={(event) => {
							const next = (event.currentTarget as HTMLInputElement).value.trim();
							const current = propertyDetails[asset.id];
							if (!current) return;
							if (!next) {
								setPropertyError(asset.id, 'name', 'Name is required.');
								return;
							}
							setPropertyError(asset.id, 'name', '');
							setPropertyDetails(asset.id, { ...current, name: next });
							setAssetsList(
								assetsList.map((a) => (a.id === asset.id ? { ...a, name: next } : a))
							);
							scheduleUpdate(`property:${asset.id}`, () =>
								updatePropertyDetails(
									asset.id,
									next,
									current.startDate,
									current.propertyUse,
									current.marketValue,
									current.marketGrowthRate,
									current.saleDate ?? '',
									current.fixedSellingCosts,
									current.variableSellingCosts
								)
							);
						}}
					/>
					{#if propertyErrors[asset.id]?.name}
						<span class="mt-1 text-[10px] text-rose-600">
							{propertyErrors[asset.id]?.name}
						</span>
					{/if}
				</div>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Market value</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="number"
						class="app-input-compact app-input-compact-lg w-24"
						value={propertyDetails[asset.id]?.marketValue ?? 0}
						step={stepForValue(propertyDetails[asset.id]?.marketValue ?? 0)}
						oninput={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const current = propertyDetails[asset.id];
							if (!current) return;
							setPropertyDetails(asset.id, {
								...current,
								marketValue: Number.isFinite(next) ? next : 0
							});
						}}
						onchange={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const current = propertyDetails[asset.id];
							if (!current) return;
							if (!Number.isFinite(next)) {
								setPropertyError(asset.id, 'marketValue', 'Use a valid number.');
								return;
							}
							setPropertyError(asset.id, 'marketValue', '');
							setPropertyDetails(asset.id, { ...current, marketValue: next });
							scheduleUpdate(`property:${asset.id}`, () =>
								updatePropertyDetails(
									asset.id,
									current.name,
									current.startDate,
									current.propertyUse,
									next,
									current.marketGrowthRate,
									current.saleDate ?? '',
									current.fixedSellingCosts,
									current.variableSellingCosts
								)
							);
						}}
					/>
					{#if propertyErrors[asset.id]?.marketValue}
						<span class="mt-1 text-[10px] text-rose-600">
							{propertyErrors[asset.id]?.marketValue}
						</span>
					{/if}
				</div>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Fixed selling costs</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="number"
						class="app-input-compact app-input-compact-lg w-24"
						value={propertyDetails[asset.id]?.fixedSellingCosts ?? 0}
						step={stepForValue(propertyDetails[asset.id]?.fixedSellingCosts ?? 0)}
						oninput={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const current = propertyDetails[asset.id];
							if (!current) return;
							setPropertyDetails(asset.id, {
								...current,
								fixedSellingCosts: Number.isFinite(next) ? next : 0
							});
						}}
						onchange={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const current = propertyDetails[asset.id];
							if (!current) return;
							if (!Number.isFinite(next)) {
								setPropertyError(asset.id, 'fixedSellingCosts', 'Use a valid number.');
								return;
							}
							setPropertyError(asset.id, 'fixedSellingCosts', '');
							setPropertyDetails(asset.id, { ...current, fixedSellingCosts: next });
							scheduleUpdate(`property:${asset.id}`, () =>
								updatePropertyDetails(
									asset.id,
									current.name,
									current.startDate,
									current.propertyUse,
									current.marketValue,
									current.marketGrowthRate,
									current.saleDate ?? '',
									next,
									current.variableSellingCosts
								)
							);
						}}
					/>
					{#if propertyErrors[asset.id]?.fixedSellingCosts}
						<span class="mt-1 text-[10px] text-rose-600">
							{propertyErrors[asset.id]?.fixedSellingCosts}
						</span>
					{/if}
				</div>
				<span></span>
			</div>
			<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
				<span class="truncate text-slate-500">Variable selling costs (%)</span>
				<div class="flex flex-col items-end justify-self-end">
					<input
						type="number"
						class="app-input-compact app-input-compact-lg w-24"
						value={propertyDetails[asset.id]?.variableSellingCosts ?? 0}
						step="0.01"
						oninput={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const current = propertyDetails[asset.id];
							if (!current) return;
							setPropertyDetails(asset.id, {
								...current,
								variableSellingCosts: Number.isFinite(next) ? next : 0
							});
						}}
						onchange={(event) => {
							const next = Number((event.currentTarget as HTMLInputElement).value);
							const current = propertyDetails[asset.id];
							if (!current) return;
							if (!Number.isFinite(next)) {
								setPropertyError(asset.id, 'variableSellingCosts', 'Use a valid number.');
								return;
							}
							setPropertyError(asset.id, 'variableSellingCosts', '');
							setPropertyDetails(asset.id, { ...current, variableSellingCosts: next });
							scheduleUpdate(`property:${asset.id}`, () =>
								updatePropertyDetails(
									asset.id,
									current.name,
									current.startDate,
									current.propertyUse,
									current.marketValue,
									current.marketGrowthRate,
									current.saleDate ?? '',
									current.fixedSellingCosts,
									next
								)
							);
						}}
					/>
					{#if propertyErrors[asset.id]?.variableSellingCosts}
						<span class="mt-1 text-[10px] text-rose-600">
							{propertyErrors[asset.id]?.variableSellingCosts}
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
						}}
						onchange={(event) => {
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
	{#each assetsList.filter((a) => a.asset_type === 'mortgage' && a.property_id === asset.id) as mortgageAsset}
		{@const mortgageAccountLink = assetAccountsList.find(
			(link) => link.asset_id === mortgageAsset.id && link.relationship_role === 'held_in'
		)}
		<div class="app-card-muted w-full">
			<div class="flex items-center justify-between gap-2">
				<h3 class="app-title-sm truncate">
					{mortgageDetails[mortgageAsset.id]?.name ?? mortgageAsset.name}
				</h3>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="text-xs font-semibold text-rose-600 hover:text-rose-700"
						onclick={() =>
							requestDeleteAsset(
								mortgageAsset.id,
								mortgageDetails[mortgageAsset.id]?.name ?? mortgageAsset.name
							)}
					>
						Delete
					</button>
					<DisclosureToggle
						expanded={expandedMortgageDetailIds.has(mortgageAsset.id)}
						onToggle={() => toggleMortgageDetails(mortgageAsset.id)}
					/>
				</div>
			</div>
			{#if expandedMortgageDetailIds.has(mortgageAsset.id)}
				<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
					<span class="truncate text-slate-500">Start date (MM YYYY)</span>
					<div class="flex flex-col items-end justify-self-end">
						<input
							type="text"
							inputmode="numeric"
							pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
							class="app-input-compact app-input-compact-lg w-24"
							value={mortgageDetails[mortgageAsset.id]?.startDate ?? ''}
							oninput={(event) => {
								const next = (event.currentTarget as HTMLInputElement).value;
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								setMortgageDetails(mortgageAsset.id, { ...current, startDate: next });
								if (next.trim().length === 0 || isValidMonthYear(next)) {
									setMortgageError(mortgageAsset.id, 'startDate', '');
								}
							}}
							onchange={(event) => {
								const next = (event.currentTarget as HTMLInputElement).value;
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								const updated = { ...current, startDate: next };
								setMortgageDetails(mortgageAsset.id, updated);
								if (!validateMortgageDetails(mortgageAsset.id, updated)) return;
								scheduleUpdate(`mortgage:${mortgageAsset.id}`, () =>
									updateMortgageDetails(
										mortgageAsset.id,
										updated.name,
										updated.startDate,
										updated.termYears,
										updated.termMonths,
										updated.mortgageAccountName,
										updated.openingBalance
									)
								);
							}}
						/>
						{#if mortgageErrors[mortgageAsset.id]?.startDate}
							<span class="mt-1 text-[10px] text-rose-600">
								{mortgageErrors[mortgageAsset.id]?.startDate}
							</span>
						{/if}
					</div>
					<span></span>
				</div>
				<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
					<span class="truncate text-slate-500">Mortgage name</span>
					<div class="flex flex-col items-end justify-self-end">
						<input
							type="text"
							class="app-input-compact app-input-compact-lg w-24"
							value={mortgageDetails[mortgageAsset.id]?.name ?? mortgageAsset.name}
							oninput={(event) => {
								const next = (event.currentTarget as HTMLInputElement).value;
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								setMortgageDetails(mortgageAsset.id, { ...current, name: next });
								if (next.trim().length > 0) {
									setMortgageError(mortgageAsset.id, 'name', '');
								}
							}}
							onchange={(event) => {
								const next = (event.currentTarget as HTMLInputElement).value.trim();
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								const updated = { ...current, name: next };
								setMortgageDetails(mortgageAsset.id, updated);
								setAssetsList(
									assetsList.map((a) =>
										a.id === mortgageAsset.id ? { ...a, name: next } : a
									)
								);
								if (!validateMortgageDetails(mortgageAsset.id, updated)) return;
								scheduleUpdate(`mortgage:${mortgageAsset.id}`, () =>
									updateMortgageDetails(
										mortgageAsset.id,
										updated.name,
										updated.startDate,
										updated.termYears,
										updated.termMonths,
										updated.mortgageAccountName,
										updated.openingBalance
									)
								);
							}}
						/>
						{#if mortgageErrors[mortgageAsset.id]?.name}
							<span class="mt-1 text-[10px] text-rose-600">
								{mortgageErrors[mortgageAsset.id]?.name}
							</span>
						{/if}
					</div>
					<span></span>
				</div>
				<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
					<span class="truncate text-slate-500">Term remaining (years)</span>
					<div class="flex flex-col items-end justify-self-end">
						<input
							type="number"
							min="0"
							step="1"
							class="app-input-compact app-input-compact-lg w-24"
							value={mortgageDetails[mortgageAsset.id]?.termYears ?? 0}
							oninput={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								setMortgageDetails(mortgageAsset.id, {
									...current,
									termYears: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0
								});
							}}
							onchange={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = mortgageDetails[mortgageAsset.id];
								if (!current || !Number.isFinite(next)) {
									setMortgageError(mortgageAsset.id, 'termYears', 'Use 0 or more years.');
									return;
								}
								const updated = { ...current, termYears: Math.max(0, Math.round(next)) };
								setMortgageDetails(mortgageAsset.id, updated);
								if (!validateMortgageDetails(mortgageAsset.id, updated)) return;
								scheduleUpdate(`mortgage:${mortgageAsset.id}`, () =>
									updateMortgageDetails(
										mortgageAsset.id,
										updated.name,
										updated.startDate,
										updated.termYears,
										updated.termMonths,
										updated.mortgageAccountName,
										updated.openingBalance
									)
								);
							}}
						/>
						{#if mortgageErrors[mortgageAsset.id]?.termYears}
							<span class="mt-1 text-[10px] text-rose-600">
								{mortgageErrors[mortgageAsset.id]?.termYears}
							</span>
						{/if}
					</div>
					<span></span>
				</div>
				<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
					<span class="truncate text-slate-500">Term remaining (months)</span>
					<div class="flex flex-col items-end justify-self-end">
						<input
							type="number"
							min="0"
							max="11"
							step="1"
							class="app-input-compact app-input-compact-lg w-24"
							value={mortgageDetails[mortgageAsset.id]?.termMonths ?? 0}
							oninput={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								setMortgageDetails(mortgageAsset.id, {
									...current,
									termMonths: Number.isFinite(next)
										? Math.min(11, Math.max(0, Math.round(next)))
										: 0
								});
							}}
							onchange={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = mortgageDetails[mortgageAsset.id];
								if (!current || !Number.isFinite(next) || next < 0 || next > 11) {
									setMortgageError(mortgageAsset.id, 'termMonths', 'Use a value from 0 to 11.');
									return;
								}
								const updated = { ...current, termMonths: Math.round(next) };
								setMortgageDetails(mortgageAsset.id, updated);
								if (!validateMortgageDetails(mortgageAsset.id, updated)) return;
								scheduleUpdate(`mortgage:${mortgageAsset.id}`, () =>
									updateMortgageDetails(
										mortgageAsset.id,
										updated.name,
										updated.startDate,
										updated.termYears,
										updated.termMonths,
										updated.mortgageAccountName,
										updated.openingBalance
									)
								);
							}}
						/>
						{#if mortgageErrors[mortgageAsset.id]?.termMonths}
							<span class="mt-1 text-[10px] text-rose-600">
								{mortgageErrors[mortgageAsset.id]?.termMonths}
							</span>
						{/if}
					</div>
					<span></span>
				</div>
				<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
					<span class="truncate text-slate-500">Mortgage account name</span>
					<div class="flex flex-col items-end justify-self-end">
						<input
							type="text"
							class="app-input-compact app-input-compact-lg w-24"
							value={mortgageDetails[mortgageAsset.id]?.mortgageAccountName ?? ''}
							oninput={(event) => {
								const next = (event.currentTarget as HTMLInputElement).value;
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								setMortgageDetails(mortgageAsset.id, {
									...current,
									mortgageAccountName: next
								});
								if (next.trim().length > 0) {
									setMortgageError(mortgageAsset.id, 'mortgageAccountName', '');
								}
							}}
							onchange={(event) => {
								const next = (event.currentTarget as HTMLInputElement).value.trim();
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								const updated = { ...current, mortgageAccountName: next };
								setMortgageDetails(mortgageAsset.id, updated);
								if (mortgageAccountLink?.account_id) {
									setAccountsList(
										accountsList.map((acc) =>
											acc.id === mortgageAccountLink.account_id
												? { ...acc, name: next }
												: acc
										)
									);
								}
								if (!validateMortgageDetails(mortgageAsset.id, updated)) return;
								scheduleUpdate(`mortgage:${mortgageAsset.id}`, () =>
									updateMortgageDetails(
										mortgageAsset.id,
										updated.name,
										updated.startDate,
										updated.termYears,
										updated.termMonths,
										updated.mortgageAccountName,
										updated.openingBalance
									)
								);
							}}
						/>
						{#if mortgageErrors[mortgageAsset.id]?.mortgageAccountName}
							<span class="mt-1 text-[10px] text-rose-600">
								{mortgageErrors[mortgageAsset.id]?.mortgageAccountName}
							</span>
						{/if}
					</div>
					<span></span>
				</div>
				<div class="app-hint mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1">
					<span class="truncate text-slate-500">Opening balance</span>
					<div class="flex flex-col items-end justify-self-end">
						<input
							type="number"
							step="0.01"
							class="app-input-compact app-input-compact-lg w-24"
							value={mortgageDetails[mortgageAsset.id]?.openingBalance ?? 0}
							oninput={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = mortgageDetails[mortgageAsset.id];
								if (!current) return;
								setMortgageDetails(mortgageAsset.id, {
									...current,
									openingBalance: Number.isFinite(next) ? next : 0
								});
							}}
							onchange={(event) => {
								const next = Number((event.currentTarget as HTMLInputElement).value);
								const current = mortgageDetails[mortgageAsset.id];
								if (!current || !Number.isFinite(next)) {
									setMortgageError(mortgageAsset.id, 'openingBalance', 'Use a valid number.');
									return;
								}
								const updated = { ...current, openingBalance: Math.round(next * 100) / 100 };
								setMortgageDetails(mortgageAsset.id, updated);
								if (!validateMortgageDetails(mortgageAsset.id, updated)) return;
								scheduleUpdate(`mortgage:${mortgageAsset.id}`, () =>
									updateMortgageDetails(
										mortgageAsset.id,
										updated.name,
										updated.startDate,
										updated.termYears,
										updated.termMonths,
										updated.mortgageAccountName,
										updated.openingBalance
									)
								);
							}}
						/>
						{#if mortgageErrors[mortgageAsset.id]?.openingBalance}
							<span class="mt-1 text-[10px] text-rose-600">
								{mortgageErrors[mortgageAsset.id]?.openingBalance}
							</span>
						{/if}
					</div>
					<span></span>
				</div>
			{/if}
		</div>
	{/each}
</div>

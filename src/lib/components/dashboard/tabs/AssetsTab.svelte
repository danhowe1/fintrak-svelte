<script lang="ts">
	import DisclosureToggle from '$lib/components/ui/DisclosureToggle.svelte';
	import CashflowDraftForm from '$lib/components/dashboard/CashflowDraftForm.svelte';
	import type { AssetsTabProps } from './types';

	let {
		data,
		person,
		cashflow,
		share,
		property,
		mortgage,
		ui
	}: AssetsTabProps = $props();

	let assetsList = $state<typeof data.assetsList>([]);
	let accountsList = $state<typeof data.accountsList>([]);
	let assetAccountsList = $derived.by(() => data.assetAccountsList);
	$effect(() => {
		assetsList = data.assetsList;
		accountsList = data.accountsList;
	});
	// svelte-ignore state_referenced_locally
	let {
		personDetails,
		personRetirementAges,
		setPersonRetirementAge,
		updateRetirementAge,
		expandedPersonDetailIds,
		togglePersonDetails,
		personDetailsErrors,
		isValidMonthYear,
		setPersonDetails,
		setPersonDetailsError,
		updatePersonDetails
	} = person;
	// svelte-ignore state_referenced_locally
	let {
		cashflowsByAssetId,
		cashflowAmounts,
		editingCashflowIds,
		setCashflowAmount,
		updateCashflowAmount,
		openCashflowFormForEdit,
		requestDeleteCashflow,
		openCashflowForm,
		activeCashflowForm,
		getDraftKey,
		cashflowDrafts,
		getCategoryOptionsFor,
		cashflowFrequencyOptions,
		getAssetAccountOptions,
		cashflowFormErrors,
		setCashflowDraft,
		closeCashflowForm,
		updateAssetCashflow,
		createAssetCashflow
	} = cashflow;
	// svelte-ignore state_referenced_locally
	let {
		shareDetails,
		shareErrors,
		expandedShareDetailIds,
		toggleShareDetails,
		setShareDetails,
		setShareError,
		updateShareDetails
	} = share;
	// svelte-ignore state_referenced_locally
	let {
		propertyDetails,
		propertyErrors,
		expandedPropertyDetailIds,
		togglePropertyDetails,
		setPropertyDetails,
		setPropertyError,
		updatePropertyDetails
	} = property;
	// svelte-ignore state_referenced_locally
	let {
		mortgageDetails,
		mortgageErrors,
		expandedMortgageDetailIds,
		toggleMortgageDetails,
		setMortgageDetails,
		setMortgageError,
		updateMortgageDetails,
		validateMortgageDetails
	} = mortgage;
	// svelte-ignore state_referenced_locally
	let { stepForValue, scheduleUpdate, formatLabel, toMonthYearInput, roundToTwo, formatRate, formatYearMonthInput } = ui;
</script>

					<div class="mt-3 flex flex-wrap gap-2">
						<a
							href="/assets/person/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add person
						</a>
						<a
							href="/assets/property/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add property
						</a>
						{#if assetsList.some((asset) => asset.asset_type === 'property')}
							<a
								href="/assets/mortgage/create"
								class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
							>
								Add mortgage
							</a>
						{/if}
						<a
							href="/assets/superannuation/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add superannuation
						</a>
						<a
							href="/assets/shares/create"
							class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
						>
							Add shares
						</a>
					</div>
					<div class="assets-cards mt-5 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
						{#each assetsList.filter((asset) => asset.asset_type === 'person') as person}
							<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
								<h3 class="text-sm font-semibold text-slate-900">
									{personDetails[person.id]?.name ?? person.name}
								</h3>
								<div
									class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Retirement age</span>
									<input
										type="number"
										class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
										value={personRetirementAges[person.id] ?? ''}
										step={stepForValue(personRetirementAges[person.id] ?? 0)}
										oninput={(event) => {
											const next = Number((event.currentTarget as HTMLInputElement).value);
											const value = Number.isFinite(next) ? next : 0;
											setPersonRetirementAge(person.id, value);
											scheduleUpdate(`retirement:${person.id}`, () =>
												updateRetirementAge(person.id, value)
											);
										}}
									/>
									<DisclosureToggle
										expanded={expandedPersonDetailIds.has(person.id)}
										onToggle={() => togglePersonDetails(person.id)}
									/>
								</div>
								{#if expandedPersonDetailIds.has(person.id)}
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Start date (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={personDetails[person.id]?.startDate ?? ''}
												oninput={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													setPersonDetails(person.id, { ...current, startDate: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'startDate', '');
													}
												}}
												onchange={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													if (next.trim().length === 0 || !isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (!current.name.trim()) {
														setPersonDetailsError(person.id, 'name', 'Name is required.');
														return;
													}
													if (current.dob.trim().length === 0 || !isValidMonthYear(current.dob)) {
														setPersonDetailsError(person.id, 'dob', 'Use MM YYYY format.');
														return;
													}
													setPersonDetailsError(person.id, 'startDate', '');
													setPersonDetails(person.id, { ...current, startDate: next });
													scheduleUpdate(`person-details:${person.id}`, () =>
														updatePersonDetails(person.id, current.name, next, current.dob)
													);
												}}
											/>
											{#if personDetailsErrors[person.id]?.startDate}
												<span class="mt-1 text-[10px] text-rose-600">
													{personDetailsErrors[person.id]?.startDate}
												</span>
											{/if}
										</div>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Name</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={personDetails[person.id]?.name ?? person.name}
												oninput={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													setPersonDetails(person.id, { ...current, name: next });
													if (next.trim().length > 0) {
														setPersonDetailsError(person.id, 'name', '');
													}
												}}
												onchange={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value.trim();
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													if (!next) {
														setPersonDetailsError(person.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.startDate.trim().length === 0 ||
														!isValidMonthYear(current.startDate)
													) {
														setPersonDetailsError(person.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (current.dob.trim().length === 0 || !isValidMonthYear(current.dob)) {
														setPersonDetailsError(person.id, 'dob', 'Use MM YYYY format.');
														return;
													}
													setPersonDetailsError(person.id, 'name', '');
													setPersonDetails(person.id, { ...current, name: next });
													assetsList = assetsList.map((asset) =>
														asset.id === person.id ? { ...asset, name: next } : asset
													);
													scheduleUpdate(`person-details:${person.id}`, () =>
														updatePersonDetails(person.id, next, current.startDate, current.dob)
													);
												}}
											/>
											{#if personDetailsErrors[person.id]?.name}
												<span class="mt-1 text-[10px] text-rose-600">
													{personDetailsErrors[person.id]?.name}
												</span>
											{/if}
										</div>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Date of birth (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={personDetails[person.id]?.dob ?? ''}
												oninput={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													setPersonDetails(person.id, { ...current, dob: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'dob', '');
													}
												}}
												onchange={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = personDetails[person.id] ?? {
														name: person.name,
														startDate: '',
														dob: ''
													};
													if (next.trim().length === 0 || !isValidMonthYear(next)) {
														setPersonDetailsError(person.id, 'dob', 'Use MM YYYY format.');
														return;
													}
													if (!current.name.trim()) {
														setPersonDetailsError(person.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.startDate.trim().length === 0 ||
														!isValidMonthYear(current.startDate)
													) {
														setPersonDetailsError(person.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													setPersonDetailsError(person.id, 'dob', '');
													setPersonDetails(person.id, { ...current, dob: next });
													scheduleUpdate(`person-details:${person.id}`, () =>
														updatePersonDetails(person.id, current.name, current.startDate, next)
													);
												}}
											/>
											{#if personDetailsErrors[person.id]?.dob}
												<span class="mt-1 text-[10px] text-rose-600">
													{personDetailsErrors[person.id]?.dob}
												</span>
											{/if}
										</div>
										<span></span>
									</div>
								{/if}
								<div class="mt-3 space-y-2">
									{#each cashflowsByAssetId[person.id] ?? [] as cashflow}
										<div
											class={`grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs ${
												cashflow.cashflow_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
											}`}
										>
											<span class="truncate">
												{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
											</span>
											<input
												id={`cashflow-input-${cashflow.id}`}
												type="number"
												class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={cashflowAmounts[cashflow.id] ?? cashflow.amount}
												step={Math.max(
													stepForValue(cashflowAmounts[cashflow.id] ?? cashflow.amount),
													0.25
												)}
												onfocus={() => {
													editingCashflowIds = new Set([...editingCashflowIds, cashflow.id]);
												}}
												onblur={() => {
													const next = new Set(editingCashflowIds);
													next.delete(cashflow.id);
													editingCashflowIds = next;
												}}
												oninput={(event) => {
													const next = Number((event.currentTarget as HTMLInputElement).value);
													const value = Number.isFinite(next) ? next : 0;
													setCashflowAmount(cashflow.id, value);
													scheduleUpdate(`cashflow:${cashflow.id}`, () =>
														updateCashflowAmount(cashflow.id, value)
													);
												}}
											/>
											<div class="flex items-center justify-end gap-1">
												<button
													type="button"
													class="text-amber-500 hover:text-amber-600"
													aria-label="Edit cashflow"
													title="Edit cashflow"
													onclick={() => openCashflowFormForEdit(person.id, cashflow)}
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
													onclick={() => requestDeleteCashflow(cashflow.id)}
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
										onclick={() => openCashflowForm(person.id, 'income')}
									>
										Add income
									</button>
									<button
										type="button"
										class="rounded-full border border-slate-200 bg-white px-3 py-1 text-rose-700"
										onclick={() => openCashflowForm(person.id, 'expense')}
									>
										Add expense
									</button>
								</div>
								{#if activeCashflowForm && activeCashflowForm.assetId === person.id}
									{@const draftKey = getDraftKey(
										person.id,
										activeCashflowForm.type,
										activeCashflowForm.cashflowId
									)}
									{@const draft = cashflowDrafts[draftKey]}
									{#if draft}
										<CashflowDraftForm
											{draft}
											isEdit={Boolean(activeCashflowForm.cashflowId)}
											categoryOptions={getCategoryOptionsFor(person.id, draft.type)}
											frequencyOptions={cashflowFrequencyOptions}
											assetAccountOptions={getAssetAccountOptions(person.id)}
											error={cashflowFormErrors[person.id]}
											amountStep={stepForValue(Number(draft.amount) || 0)}
											onUpdate={(updates) => setCashflowDraft(draftKey, updates)}
											onCancel={closeCashflowForm}
											onSubmit={() =>
												activeCashflowForm?.cashflowId
													? updateAssetCashflow(person.id, activeCashflowForm.cashflowId, draft)
													: createAssetCashflow(person.id, draft)}
										/>
									{/if}
								{/if}
							</div>
						{/each}
						{#each assetsList.filter((asset) => asset.asset_type === 'shares') as share}
							<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
								<h3 class="truncate text-sm font-semibold text-slate-900">
									{shareDetails[share.id]?.name ?? share.name}
								</h3>
								<div
									class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Capital growth rate</span>
									<div class="flex flex-col items-end justify-self-end">
										<input
											type="number"
											class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={formatRate(shareDetails[share.id]?.capitalGrowthRate ?? 0, 2)}
											step="0.01"
											oninput={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												setShareDetails(share.id, {
													...current,
													capitalGrowthRate: Number.isFinite(next) ? next : 0
												});
											}}
											onchange={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												if (!Number.isFinite(next)) {
													setShareError(share.id, 'capitalGrowthRate', 'Use a valid number.');
													return;
												}
												setShareError(share.id, 'capitalGrowthRate', '');
												setShareDetails(share.id, {
													...current,
													capitalGrowthRate: roundToTwo(next)
												});
												scheduleUpdate(`shares:${share.id}`, () =>
													updateShareDetails(
														share.id,
														current.name,
														current.startDate,
														roundToTwo(next),
														current.dividendYield,
														current.dividendsTakenAsIncomeDate
													)
												);
											}}
										/>
										{#if shareErrors[share.id]?.capitalGrowthRate}
											<span class="mt-1 text-[10px] text-rose-600">
												{shareErrors[share.id]?.capitalGrowthRate}
											</span>
										{/if}
									</div>
									<span></span>
								</div>
								<div
									class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Dividend yield</span>
									<div class="flex flex-col items-end justify-self-end">
										<input
											type="number"
											class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={formatRate(shareDetails[share.id]?.dividendYield ?? 0, 2)}
											step="0.01"
											oninput={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												setShareDetails(share.id, {
													...current,
													dividendYield: Number.isFinite(next) ? next : 0
												});
											}}
											onchange={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = shareDetails[share.id];
												if (!current) return;
												if (!Number.isFinite(next)) {
													setShareError(share.id, 'dividendYield', 'Use a valid number.');
													return;
												}
												setShareError(share.id, 'dividendYield', '');
												setShareDetails(share.id, { ...current, dividendYield: roundToTwo(next) });
												scheduleUpdate(`shares:${share.id}`, () =>
													updateShareDetails(
														share.id,
														current.name,
														current.startDate,
														current.capitalGrowthRate,
														roundToTwo(next),
														current.dividendsTakenAsIncomeDate
													)
												);
											}}
										/>
										{#if shareErrors[share.id]?.dividendYield}
											<span class="mt-1 text-[10px] text-rose-600">
												{shareErrors[share.id]?.dividendYield}
											</span>
										{/if}
									</div>
									<span></span>
								</div>
								<div
									class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
								>
									<span class="truncate text-slate-500">Dividends taken as income</span>
									<div class="flex flex-col items-end justify-self-end">
										<input
											type="text"
											inputmode="numeric"
											pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
											class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={shareDetails[share.id]?.dividendsTakenAsIncomeDate ?? ''}
											oninput={(event) => {
												const next = (event.currentTarget as HTMLInputElement).value;
												const current = shareDetails[share.id];
												if (!current) return;
												setShareDetails(share.id, { ...current, dividendsTakenAsIncomeDate: next });
												if (next.trim().length === 0 || isValidMonthYear(next)) {
													setShareError(share.id, 'dividendsTakenAsIncomeDate', '');
												}
											}}
											onchange={(event) => {
												const next = (event.currentTarget as HTMLInputElement).value;
												const current = shareDetails[share.id];
												if (!current) return;
												if (next.trim().length === 0 || !isValidMonthYear(next)) {
													setShareError(
														share.id,
														'dividendsTakenAsIncomeDate',
														'Use MM YYYY format.'
													);
													return;
												}
												setShareError(share.id, 'dividendsTakenAsIncomeDate', '');
												setShareDetails(share.id, { ...current, dividendsTakenAsIncomeDate: next });
												scheduleUpdate(`shares:${share.id}`, () =>
													updateShareDetails(
														share.id,
														current.name,
														current.startDate,
														current.capitalGrowthRate,
														current.dividendYield,
														next
													)
												);
											}}
										/>
										{#if shareErrors[share.id]?.dividendsTakenAsIncomeDate}
											<span class="mt-1 text-[10px] text-rose-600">
												{shareErrors[share.id]?.dividendsTakenAsIncomeDate}
											</span>
										{/if}
									</div>
									<DisclosureToggle
										expanded={expandedShareDetailIds.has(share.id)}
										onToggle={() => toggleShareDetails(share.id)}
									/>
								</div>
								{#if expandedShareDetailIds.has(share.id)}
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Start date (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={shareDetails[share.id]?.startDate ?? ''}
												oninput={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = shareDetails[share.id];
													if (!current) return;
													setShareDetails(share.id, { ...current, startDate: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setShareError(share.id, 'startDate', '');
													}
												}}
												onchange={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = shareDetails[share.id];
													if (!current) return;
													if (next.trim().length === 0 || !isValidMonthYear(next)) {
														setShareError(share.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (!current.name.trim()) {
														setShareError(share.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.dividendsTakenAsIncomeDate.trim().length === 0 ||
														!isValidMonthYear(current.dividendsTakenAsIncomeDate)
													) {
														setShareError(
															share.id,
															'dividendsTakenAsIncomeDate',
															'Use MM YYYY format.'
														);
														return;
													}
													setShareError(share.id, 'startDate', '');
													setShareDetails(share.id, { ...current, startDate: next });
													scheduleUpdate(`shares:${share.id}`, () =>
														updateShareDetails(
															share.id,
															current.name,
															next,
															current.capitalGrowthRate,
															current.dividendYield,
															current.dividendsTakenAsIncomeDate
														)
													);
												}}
											/>
											{#if shareErrors[share.id]?.startDate}
												<span class="mt-1 text-[10px] text-rose-600"
													>{shareErrors[share.id]?.startDate}</span
												>
											{/if}
										</div>
										<span></span>
									</div>
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Name</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={shareDetails[share.id]?.name ?? share.name}
												oninput={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = shareDetails[share.id];
													if (!current) return;
													setShareDetails(share.id, { ...current, name: next });
													if (next.trim().length > 0) {
														setShareError(share.id, 'name', '');
													}
												}}
												onchange={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value.trim();
													const current = shareDetails[share.id];
													if (!current) return;
													if (!next) {
														setShareError(share.id, 'name', 'Name is required.');
														return;
													}
													if (
														current.startDate.trim().length === 0 ||
														!isValidMonthYear(current.startDate)
													) {
														setShareError(share.id, 'startDate', 'Use MM YYYY format.');
														return;
													}
													if (
														current.dividendsTakenAsIncomeDate.trim().length === 0 ||
														!isValidMonthYear(current.dividendsTakenAsIncomeDate)
													) {
														setShareError(
															share.id,
															'dividendsTakenAsIncomeDate',
															'Use MM YYYY format.'
														);
														return;
													}
													setShareError(share.id, 'name', '');
													setShareDetails(share.id, { ...current, name: next });
													assetsList = assetsList.map((asset) =>
														asset.id === share.id ? { ...asset, name: next } : asset
													);
													scheduleUpdate(`shares:${share.id}`, () =>
														updateShareDetails(
															share.id,
															next,
															current.startDate,
															current.capitalGrowthRate,
															current.dividendYield,
															current.dividendsTakenAsIncomeDate
														)
													);
												}}
											/>
											{#if shareErrors[share.id]?.name}
												<span class="mt-1 text-[10px] text-rose-600"
													>{shareErrors[share.id]?.name}</span
												>
											{/if}
										</div>
										<span></span>
									</div>
								{/if}
							</div>
						{/each}
						{#each assetsList.filter((asset) => asset.asset_type === 'property') as property}
							<div class="flex w-full flex-col gap-3">
								<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
									<h3 class="text-sm font-semibold text-slate-900">
										{propertyDetails[property.id]?.name ?? property.name}
									</h3>
									<div
										class="mt-3 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Market growth rate</span>
										<input
											type="number"
											class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
											value={formatRate(propertyDetails[property.id]?.marketGrowthRate ?? 0, 1)}
											step="0.5"
											oninput={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = propertyDetails[property.id] ?? {
													name: property.name,
													startDate: formatYearMonthInput(property.start_date),
													marketValue: Number(property.details?.marketValue) || 0,
													marketGrowthRate: 0,
													saleDate: '',
													fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
													variableSellingCosts: Number(property.details?.variableSellingCosts) || 0
												};
												setPropertyDetails(property.id, {
													...current,
													marketGrowthRate: Number.isFinite(next) ? next : 0
												});
											}}
											onchange={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const current = propertyDetails[property.id] ?? {
													name: property.name,
													startDate: formatYearMonthInput(property.start_date),
													marketValue: Number(property.details?.marketValue) || 0,
													marketGrowthRate: 0,
													saleDate: '',
													fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
													variableSellingCosts: Number(property.details?.variableSellingCosts) || 0
												};
												const value = Number.isFinite(next) ? next : 0;
												setPropertyDetails(property.id, { ...current, marketGrowthRate: value });
												scheduleUpdate(`property:${property.id}`, () =>
													updatePropertyDetails(
														property.id,
														current.name,
														current.startDate,
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
									<div
										class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
									>
										<span class="truncate text-slate-500">Sale date (MM YYYY)</span>
										<div class="flex flex-col items-end justify-self-end">
											<input
												type="text"
												inputmode="numeric"
												pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
												class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
												value={propertyDetails[property.id]?.saleDate ?? ''}
												oninput={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = propertyDetails[property.id] ?? {
														name: property.name,
														startDate: formatYearMonthInput(property.start_date),
														marketValue: Number(property.details?.marketValue) || 0,
														marketGrowthRate: 0,
														saleDate: '',
														fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
														variableSellingCosts:
															Number(property.details?.variableSellingCosts) || 0
													};
													setPropertyDetails(property.id, { ...current, saleDate: next });
													if (next.trim().length === 0 || isValidMonthYear(next)) {
														setPropertyError(property.id, 'saleDate', '');
													}
												}}
												onchange={(event) => {
													const next = (event.currentTarget as HTMLInputElement).value;
													const current = propertyDetails[property.id] ?? {
														name: property.name,
														startDate: formatYearMonthInput(property.start_date),
														marketValue: Number(property.details?.marketValue) || 0,
														marketGrowthRate: 0,
														saleDate: '',
														fixedSellingCosts: Number(property.details?.fixedSellingCosts) || 0,
														variableSellingCosts:
															Number(property.details?.variableSellingCosts) || 0
													};
													if (next.trim().length > 0 && !isValidMonthYear(next)) {
														setPropertyError(property.id, 'saleDate', 'Use MM YYYY format.');
														return;
													}
													setPropertyError(property.id, 'saleDate', '');
													setPropertyDetails(property.id, { ...current, saleDate: next });
													scheduleUpdate(`property:${property.id}`, () =>
														updatePropertyDetails(
															property.id,
															current.name,
															current.startDate,
															current.marketValue ?? 0,
															current.marketGrowthRate ?? 0,
															next,
															current.fixedSellingCosts ?? 0,
															current.variableSellingCosts ?? 0
														)
													);
												}}
											/>
											{#if propertyErrors[property.id]?.saleDate}
												<span class="mt-1 text-[10px] text-rose-600">
													{propertyErrors[property.id]?.saleDate}
												</span>
											{/if}
										</div>
										<DisclosureToggle
											expanded={expandedPropertyDetailIds.has(property.id)}
											onToggle={() => togglePropertyDetails(property.id)}
										/>
									</div>
									{#if expandedPropertyDetailIds.has(property.id)}
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Start date (MM YYYY)</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="text"
													inputmode="numeric"
													pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.startDate ?? ''}
													oninput={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value;
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, { ...current, startDate: next });
														if (next.trim().length > 0 && isValidMonthYear(next)) {
															setPropertyError(property.id, 'startDate', '');
														}
													}}
													onchange={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value;
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!isValidMonthYear(next)) {
															setPropertyError(property.id, 'startDate', 'Use MM YYYY format.');
															return;
														}
														setPropertyError(property.id, 'startDate', '');
														setPropertyDetails(property.id, { ...current, startDate: next });
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																next,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.startDate}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.startDate}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Name</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="text"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.name ?? property.name}
													oninput={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value;
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, { ...current, name: next });
														if (next.trim().length > 0) {
															setPropertyError(property.id, 'name', '');
														}
													}}
													onchange={(event) => {
														const next = (event.currentTarget as HTMLInputElement).value.trim();
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!next) {
															setPropertyError(property.id, 'name', 'Name is required.');
															return;
														}
														setPropertyError(property.id, 'name', '');
														setPropertyDetails(property.id, { ...current, name: next });
														assetsList = assetsList.map((asset) =>
															asset.id === property.id ? { ...asset, name: next } : asset
														);
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																next,
																current.startDate,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.name}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.name}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Market value</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="number"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.marketValue ?? 0}
													step={stepForValue(propertyDetails[property.id]?.marketValue ?? 0)}
													oninput={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, {
															...current,
															marketValue: Number.isFinite(next) ? next : 0
														});
													}}
													onchange={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!Number.isFinite(next)) {
															setPropertyError(property.id, 'marketValue', 'Use a valid number.');
															return;
														}
														setPropertyError(property.id, 'marketValue', '');
														setPropertyDetails(property.id, { ...current, marketValue: next });
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																current.startDate,
																next,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.marketValue}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.marketValue}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Fixed selling costs</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="number"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.fixedSellingCosts ?? 0}
													step={stepForValue(propertyDetails[property.id]?.fixedSellingCosts ?? 0)}
													oninput={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, {
															...current,
															fixedSellingCosts: Number.isFinite(next) ? next : 0
														});
													}}
													onchange={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!Number.isFinite(next)) {
															setPropertyError(
																property.id,
																'fixedSellingCosts',
																'Use a valid number.'
															);
															return;
														}
														setPropertyError(property.id, 'fixedSellingCosts', '');
														setPropertyDetails(property.id, {
															...current,
															fixedSellingCosts: next
														});
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																current.startDate,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																next,
																current.variableSellingCosts
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.fixedSellingCosts}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.fixedSellingCosts}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
										<div
											class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
										>
											<span class="truncate text-slate-500">Variable selling costs (%)</span>
											<div class="flex flex-col items-end justify-self-end">
												<input
													type="number"
													class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={propertyDetails[property.id]?.variableSellingCosts ?? 0}
													step="0.01"
													oninput={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														setPropertyDetails(property.id, {
															...current,
															variableSellingCosts: Number.isFinite(next) ? next : 0
														});
													}}
													onchange={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const current = propertyDetails[property.id];
														if (!current) return;
														if (!Number.isFinite(next)) {
															setPropertyError(
																property.id,
																'variableSellingCosts',
																'Use a valid number.'
															);
															return;
														}
														setPropertyError(property.id, 'variableSellingCosts', '');
														setPropertyDetails(property.id, {
															...current,
															variableSellingCosts: next
														});
														scheduleUpdate(`property:${property.id}`, () =>
															updatePropertyDetails(
																property.id,
																current.name,
																current.startDate,
																current.marketValue,
																current.marketGrowthRate,
																current.saleDate ?? '',
																current.fixedSellingCosts,
																next
															)
														);
													}}
												/>
												{#if propertyErrors[property.id]?.variableSellingCosts}
													<span class="mt-1 text-[10px] text-rose-600">
														{propertyErrors[property.id]?.variableSellingCosts}
													</span>
												{/if}
											</div>
											<span></span>
										</div>
									{/if}
									<div class="mt-3 space-y-2">
										{#each cashflowsByAssetId[property.id] ?? [] as cashflow}
											<div
												class={`grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs ${
													cashflow.cashflow_type === 'income' ? 'text-emerald-600' : 'text-rose-600'
												}`}
											>
												<span class="truncate">
													{`${formatLabel(cashflow.category)} ${cashflow.description ?? ''}`.trim()}
												</span>
												<input
													type="number"
													class="w-24 justify-self-end rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
													value={cashflowAmounts[cashflow.id] ?? cashflow.amount}
													step={Math.max(
														stepForValue(cashflowAmounts[cashflow.id] ?? cashflow.amount),
														0.25
													)}
													onfocus={() => {
														editingCashflowIds = new Set([...editingCashflowIds, cashflow.id]);
													}}
													onblur={() => {
														const next = new Set(editingCashflowIds);
														next.delete(cashflow.id);
														editingCashflowIds = next;
													}}
													oninput={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const value = Number.isFinite(next) ? next : 0;
														setCashflowAmount(cashflow.id, value);
													}}
													onchange={(event) => {
														const next = Number((event.currentTarget as HTMLInputElement).value);
														const value = Number.isFinite(next) ? next : 0;
														setCashflowAmount(cashflow.id, value);
														scheduleUpdate(`cashflow:${cashflow.id}`, () =>
															updateCashflowAmount(cashflow.id, value)
														);
													}}
												/>
												<div class="flex items-center justify-end gap-1">
													<button
														type="button"
														class="text-amber-500 hover:text-amber-600"
														aria-label="Edit cashflow"
														title="Edit cashflow"
														onclick={() => openCashflowFormForEdit(property.id, cashflow)}
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
														onclick={() => requestDeleteCashflow(cashflow.id)}
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
											onclick={() => openCashflowForm(property.id, 'income')}
										>
											Add income
										</button>
										<button
											type="button"
											class="rounded-full border border-slate-200 bg-white px-3 py-1 text-rose-700"
											onclick={() => openCashflowForm(property.id, 'expense')}
										>
											Add expense
										</button>
									</div>
									{#if activeCashflowForm && activeCashflowForm.assetId === property.id}
										{@const draftKey = getDraftKey(
											property.id,
											activeCashflowForm.type,
											activeCashflowForm.cashflowId
										)}
										{@const draft = cashflowDrafts[draftKey]}
										{#if draft}
											<CashflowDraftForm
												{draft}
												isEdit={Boolean(activeCashflowForm.cashflowId)}
												categoryOptions={getCategoryOptionsFor(property.id, draft.type)}
												frequencyOptions={cashflowFrequencyOptions}
												assetAccountOptions={getAssetAccountOptions(property.id)}
												error={cashflowFormErrors[property.id]}
												amountStep={stepForValue(Number(draft.amount) || 0)}
												onUpdate={(updates) => setCashflowDraft(draftKey, updates)}
												onCancel={closeCashflowForm}
												onSubmit={() =>
													activeCashflowForm?.cashflowId
														? updateAssetCashflow(property.id, activeCashflowForm.cashflowId, draft)
														: createAssetCashflow(property.id, draft)}
											/>
										{/if}
									{/if}
								</div>
								{#each assetsList.filter((asset) => asset.asset_type === 'mortgage' && asset.property_id === property.id) as mortgage}
									{@const mortgageAccountLink = assetAccountsList.find(
										(link) => link.asset_id === mortgage.id && link.relationship_role === 'held_in'
									)}
									<div class="w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
										<div class="flex items-center justify-between gap-2">
											<h3 class="truncate text-sm font-semibold text-slate-900">
												{mortgageDetails[mortgage.id]?.name ?? mortgage.name}
											</h3>
											<DisclosureToggle
												expanded={expandedMortgageDetailIds.has(mortgage.id)}
												onToggle={() => toggleMortgageDetails(mortgage.id)}
											/>
										</div>
										{#if expandedMortgageDetailIds.has(mortgage.id)}
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Start date (MM YYYY)</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="text"
														inputmode="numeric"
														pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.startDate ?? ''}
														oninput={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, { ...current, startDate: next });
															if (next.trim().length === 0 || isValidMonthYear(next)) {
																setMortgageError(mortgage.id, 'startDate', '');
															}
														}}
														onchange={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															const updated = { ...current, startDate: next };
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
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
													{#if mortgageErrors[mortgage.id]?.startDate}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.startDate}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Mortgage name</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="text"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.name ?? mortgage.name}
														oninput={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, { ...current, name: next });
															if (next.trim().length > 0) {
																setMortgageError(mortgage.id, 'name', '');
															}
														}}
														onchange={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value.trim();
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															const updated = { ...current, name: next };
															setMortgageDetails(mortgage.id, updated);
															assetsList = assetsList.map((asset) =>
																asset.id === mortgage.id ? { ...asset, name: next } : asset
															);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
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
													{#if mortgageErrors[mortgage.id]?.name}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.name}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Term remaining (years)</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="number"
														min="0"
														step="1"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.termYears ?? 0}
														oninput={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																termYears: Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0
															});
														}}
														onchange={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current || !Number.isFinite(next)) {
																setMortgageError(mortgage.id, 'termYears', 'Use 0 or more years.');
																return;
															}
															const updated = {
																...current,
																termYears: Math.max(0, Math.round(next))
															};
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
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
													{#if mortgageErrors[mortgage.id]?.termYears}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.termYears}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Term remaining (months)</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="number"
														min="0"
														max="11"
														step="1"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.termMonths ?? 0}
														oninput={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																termMonths: Number.isFinite(next)
																	? Math.min(11, Math.max(0, Math.round(next)))
																	: 0
															});
														}}
														onchange={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current || !Number.isFinite(next) || next < 0 || next > 11) {
																setMortgageError(
																	mortgage.id,
																	'termMonths',
																	'Use a value from 0 to 11.'
																);
																return;
															}
															const updated = {
																...current,
																termMonths: Math.round(next)
															};
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
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
													{#if mortgageErrors[mortgage.id]?.termMonths}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.termMonths}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Mortgage account name</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="text"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.mortgageAccountName ?? ''}
														oninput={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value;
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																mortgageAccountName: next
															});
															if (next.trim().length > 0) {
																setMortgageError(mortgage.id, 'mortgageAccountName', '');
															}
														}}
														onchange={(event) => {
															const next = (event.currentTarget as HTMLInputElement).value.trim();
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															const updated = { ...current, mortgageAccountName: next };
															setMortgageDetails(mortgage.id, updated);
															if (mortgageAccountLink?.account_id) {
																accountsList = accountsList.map((account) =>
																	account.id === mortgageAccountLink.account_id
																		? { ...account, name: next }
																		: account
																);
															}
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
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
													{#if mortgageErrors[mortgage.id]?.mortgageAccountName}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.mortgageAccountName}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
											<div
												class="mt-2 grid grid-cols-[140px_100px_32px] items-center gap-1 text-xs text-slate-600"
											>
												<span class="truncate text-slate-500">Opening balance</span>
												<div class="flex flex-col items-end justify-self-end">
													<input
														type="number"
														step="0.01"
														class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
														value={mortgageDetails[mortgage.id]?.openingBalance ?? 0}
														oninput={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current) return;
															setMortgageDetails(mortgage.id, {
																...current,
																openingBalance: Number.isFinite(next) ? next : 0
															});
														}}
														onchange={(event) => {
															const next = Number((event.currentTarget as HTMLInputElement).value);
															const current = mortgageDetails[mortgage.id];
															if (!current || !Number.isFinite(next)) {
																setMortgageError(
																	mortgage.id,
																	'openingBalance',
																	'Use a valid number.'
																);
																return;
															}
															const updated = {
																...current,
																openingBalance: Math.round(next * 100) / 100
															};
															setMortgageDetails(mortgage.id, updated);
															if (!validateMortgageDetails(mortgage.id, updated)) return;
															scheduleUpdate(`mortgage:${mortgage.id}`, () =>
																updateMortgageDetails(
																	mortgage.id,
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
													{#if mortgageErrors[mortgage.id]?.openingBalance}
														<span class="mt-1 text-[10px] text-rose-600">
															{mortgageErrors[mortgage.id]?.openingBalance}
														</span>
													{/if}
												</div>
												<span></span>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>

<style>
	.assets-cards input {
		font-size: 0.75rem;
		line-height: 1rem;
	}
</style>

<script lang="ts">
	import type { MonthFrequency, TransfersTabProps } from './types';

	let { data, handlers, ui }: TransfersTabProps = $props();
</script>

<div class="mt-5 space-y-4">
	<div class="rounded-xl border border-slate-200 bg-white p-3">
		<h3 class="text-sm font-semibold text-slate-900">Existing transfers</h3>
		{#if data.transferCashflows.length === 0}
			<div class="mt-2 text-sm text-slate-600">No transfers configured.</div>
		{:else}
			<div class="mt-2 overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 text-xs">
					<thead class="bg-slate-50 text-left text-slate-500 uppercase">
						<tr>
							<th class="px-2 py-2">From</th>
							<th class="px-2 py-2">To</th>
							<th class="px-2 py-2">Category</th>
							<th class="px-2 py-2">Inflation</th>
							<th class="px-2 py-2">Amount</th>
							<th class="px-2 py-2">Frequency</th>
							<th class="px-2 py-2">Start</th>
							<th class="px-2 py-2">End</th>
							<th class="px-2 py-2">Description</th>
							<th class="px-2 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 text-slate-700">
						{#each data.transferCashflows as transfer}
							{@const transferDraftRow = data.transferEditDrafts[transfer.id]}
							<tr>
								<td class="px-2 py-2">
									<select
										class="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
										value={transferDraftRow?.sourceAccountId ?? transfer.source_account_id ?? ''}
										onchange={(event) => {
											handlers.setTransferEditDraft(transfer.id, {
												sourceAccountId: (event.currentTarget as HTMLSelectElement).value
											});
											ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
												handlers.saveTransferEditDraft(transfer.id)
											);
										}}
									>
										<option value="">Select account</option>
										{#each data.transferAccountOptions as option}
											<option value={option.id}>{option.name}</option>
										{/each}
									</select>
								</td>
								<td class="px-2 py-2">
									<select
										class="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
										value={transferDraftRow?.destinationAccountId ?? transfer.destination_account_id ?? ''}
										onchange={(event) => {
											handlers.setTransferEditDraft(transfer.id, {
												destinationAccountId: (event.currentTarget as HTMLSelectElement).value
											});
											ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
												handlers.saveTransferEditDraft(transfer.id)
											);
										}}
									>
										<option value="">Select account</option>
										{#each data.transferAccountOptions as option}
											<option value={option.id}>{option.name}</option>
										{/each}
									</select>
								</td>
								<td class="px-2 py-2">{ui.formatLabel(transfer.category)}</td>
								<td class="px-2 py-2">
									<input
										type="checkbox"
										class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
										checked={transfer.inflation_affected}
										onchange={(event) =>
											handlers.onTransferInflationToggle(
												transfer.id,
												(event.currentTarget as HTMLInputElement).checked
											)}
									/>
								</td>
								<td class="px-2 py-2">
									<input
										type="number"
										min="0"
										step="0.01"
										class="no-spin w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
										value={transferDraftRow?.amount ?? String(transfer.amount)}
										oninput={(event) =>
											handlers.setTransferEditDraft(transfer.id, {
												amount: (event.currentTarget as HTMLInputElement).value
											})}
										onchange={() =>
											ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
												handlers.saveTransferEditDraft(transfer.id)
											)}
									/>
								</td>
								<td class="px-2 py-2">
									<select
										class="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
										value={transferDraftRow?.frequency ?? transfer.frequency}
										onchange={(event) => {
											const nextFrequency = (event.currentTarget as HTMLSelectElement)
												.value as MonthFrequency;
											handlers.setTransferEditDraft(transfer.id, {
												frequency: nextFrequency,
												endDate: nextFrequency === 'one_time' ? '' : (transferDraftRow?.endDate ?? '')
											});
											ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
												handlers.saveTransferEditDraft(transfer.id)
											);
										}}
									>
										{#each ui.cashflowFrequencyOptions as option}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</td>
								<td class="px-2 py-2">
									<input
										type="text"
										inputmode="numeric"
										pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
										class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
										value={transferDraftRow?.startDate ?? ui.toMonthYearInput(transfer.start_date)}
										oninput={(event) =>
											handlers.setTransferEditDraft(transfer.id, {
												startDate: (event.currentTarget as HTMLInputElement).value
											})}
										onchange={() =>
											ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
												handlers.saveTransferEditDraft(transfer.id)
											)}
									/>
								</td>
								<td class="px-2 py-2">
									{#if (transferDraftRow?.frequency ?? transfer.frequency) === 'one_time'}
										<span class="text-slate-400">—</span>
									{:else}
										<input
											type="text"
											inputmode="numeric"
											pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
											class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
											value={transferDraftRow?.endDate ?? ui.toMonthYearInput(transfer.end_date)}
											oninput={(event) =>
												handlers.setTransferEditDraft(transfer.id, {
													endDate: (event.currentTarget as HTMLInputElement).value
												})}
											onchange={() =>
												ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
													handlers.saveTransferEditDraft(transfer.id)
												)}
										/>
									{/if}
								</td>
								<td class="px-2 py-2">
									<input
										type="text"
										class="w-40 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
										value={transferDraftRow?.description ?? transfer.description ?? ''}
										oninput={(event) =>
											handlers.setTransferEditDraft(transfer.id, {
												description: (event.currentTarget as HTMLInputElement).value
											})}
										onchange={() =>
											ui.scheduleUpdate(`transfer-edit:${transfer.id}`, () =>
												handlers.saveTransferEditDraft(transfer.id)
											)}
									/>
								</td>
								<td class="px-2 py-2 text-right">
									<button
										type="button"
										class="text-rose-500 hover:text-rose-600"
										aria-label="Delete transfer"
										title="Delete transfer"
										onclick={() => handlers.requestDeleteCashflow(transfer.id)}
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
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if data.transferInlineError}
				<div class="mt-2 text-xs text-rose-600">{data.transferInlineError}</div>
			{/if}
		{/if}
	</div>

	<div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
		<h3 class="text-sm font-semibold text-slate-900">New transfer</h3>
		<div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			<label class="text-xs text-slate-600">
				<span class="mb-1 block text-slate-500">From account</span>
				<select
					class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
					value={data.transferDraft.sourceAccountId}
					onchange={(event) =>
						handlers.onTransferDraftChange({
							sourceAccountId: (event.currentTarget as HTMLSelectElement).value
						})}
				>
					<option value="">Select account</option>
					{#each data.transferAccountOptions as option}
						<option value={option.id}>{option.name}</option>
					{/each}
				</select>
			</label>
			<label class="text-xs text-slate-600">
				<span class="mb-1 block text-slate-500">To account</span>
				<select
					class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
					value={data.transferDraft.destinationAccountId}
					onchange={(event) =>
						handlers.onTransferDraftChange({
							destinationAccountId: (event.currentTarget as HTMLSelectElement).value
						})}
				>
					<option value="">Select account</option>
					{#each data.transferAccountOptions as option}
						<option value={option.id}>{option.name}</option>
					{/each}
				</select>
			</label>
			<label class="text-xs text-slate-600">
				<span class="mb-1 block text-slate-500">Amount</span>
				<input
					type="number"
					min="0"
					step="0.01"
					class="no-spin w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
					value={data.transferDraft.amount}
					oninput={(event) =>
						handlers.onTransferDraftChange({
							amount: (event.currentTarget as HTMLInputElement).value
						})}
				/>
			</label>
			<label class="text-xs text-slate-600">
				<span class="mb-1 block text-slate-500">Frequency</span>
				<select
					class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
					value={data.transferDraft.frequency}
					onchange={(event) => {
						const nextFrequency = (event.currentTarget as HTMLSelectElement).value as MonthFrequency;
						handlers.onTransferDraftChange({
							frequency: nextFrequency,
							endDate: nextFrequency === 'one_time' ? '' : data.transferDraft.endDate
						});
					}}
				>
					{#each ui.cashflowFrequencyOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="text-xs text-slate-600">
				<span class="mb-1 block text-slate-500">Start date (MM YYYY)</span>
				<input
					type="text"
					inputmode="numeric"
					pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
					class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
					value={data.transferDraft.startDate}
					oninput={(event) =>
						handlers.onTransferDraftChange({
							startDate: (event.currentTarget as HTMLInputElement).value
						})}
				/>
			</label>
			{#if data.transferDraft.frequency !== 'one_time'}
				<label class="text-xs text-slate-600">
					<span class="mb-1 block text-slate-500">End date (optional)</span>
					<input
						type="text"
						inputmode="numeric"
						pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
						class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
						value={data.transferDraft.endDate}
						oninput={(event) =>
							handlers.onTransferDraftChange({
								endDate: (event.currentTarget as HTMLInputElement).value
							})}
					/>
				</label>
			{/if}
			<label class="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
				<span class="mb-1 block text-slate-500">Inflation affected</span>
				<label class="inline-flex items-center gap-2">
					<input
						type="checkbox"
						class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
						checked={data.transferDraft.inflationAffected}
						onchange={(event) =>
							handlers.onTransferDraftChange({
								inflationAffected: (event.currentTarget as HTMLInputElement).checked
							})}
					/>
					<span class="text-xs text-slate-700">Apply inflation over time</span>
				</label>
			</label>
			<label class="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
				<span class="mb-1 block text-slate-500">Description (optional)</span>
				<input
					type="text"
					class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
					value={data.transferDraft.description}
					oninput={(event) =>
						handlers.onTransferDraftChange({
							description: (event.currentTarget as HTMLInputElement).value
						})}
				/>
			</label>
		</div>
		{#if data.transferFormError}
			<div class="mt-2 text-xs text-rose-600">{data.transferFormError}</div>
		{/if}
		<div class="mt-3 flex justify-end">
			<button
				type="button"
				class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
				disabled={data.transferAccountOptions.length < 2}
				onclick={handlers.createTransferCashflow}
			>
				Add transfer
			</button>
		</div>
	</div>
</div>




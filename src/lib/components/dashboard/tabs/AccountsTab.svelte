<script lang="ts">
	import type { AccountsTabProps } from './types';
	import AppTable from '$lib/components/ui/AppTable.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';

	let { data, actions, ui }: AccountsTabProps = $props();
</script>

<div class="app-card mt-5">
	{#if data.accountsList.length > 0}
		<div class="overflow-x-auto">
			<AppTable>
				<thead class="bg-slate-50 text-left text-slate-500 uppercase">
					<tr>
						<th class="app-cell">Start</th>
						<th class="app-cell">Name</th>
						<th class="app-cell">Opening balance</th>
						<th class="app-cell">Interest rate</th>
						<th class="app-cell">Account type</th>
					</tr>
				</thead>
				<tbody class="app-table-body">
					{#each data.accountsList as account}
						{@const draft = data.accountEditDrafts[account.id]}
						<tr>
							<td class="app-cell">
								<input
									type="text"
									inputmode="numeric"
									pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
									class="app-input-compact w-24"
									value={draft?.startDate ?? ui.toMonthYearInput(account.start_date)}
									oninput={(event) =>
										actions.setAccountEditDraft(account.id, {
											startDate: (event.currentTarget as HTMLInputElement).value
										})}
									onchange={() =>
										ui.scheduleUpdate(`account-edit:${account.id}`, () =>
											actions.saveAccountEditDraft(account.id)
										)}
								/>
							</td>
							<td class="app-cell">
								<input
									type="text"
									class="app-input-compact w-44"
									value={draft?.name ?? account.name}
									oninput={(event) =>
										actions.setAccountEditDraft(account.id, {
											name: (event.currentTarget as HTMLInputElement).value
										})}
									onchange={() =>
										ui.scheduleUpdate(`account-edit:${account.id}`, () =>
											actions.saveAccountEditDraft(account.id)
										)}
								/>
							</td>
							<td class="app-cell">
								<input
									type="number"
									step="0.01"
									class="no-spin app-input-compact w-32"
									value={draft?.openingBalance ?? String(account.opening_balance)}
									oninput={(event) =>
										actions.setAccountEditDraft(account.id, {
											openingBalance: (event.currentTarget as HTMLInputElement).value
										})}
									onchange={() =>
										ui.scheduleUpdate(`account-edit:${account.id}`, () =>
											actions.saveAccountEditDraft(account.id)
										)}
								/>
							</td>
							<td class="app-cell">
								{#if account.account_type === 'super_account' || account.account_type === 'brokerage'}
									<span class="text-slate-400">—</span>
								{:else}
									<div class="flex items-center gap-1">
										<input
											id={`account-interest-rate-input-${account.id}`}
											type="number"
											class="no-spin app-input-compact w-20"
											value={ui.formatRate(data.accountInterestRates[account.id] ?? 0, 2)}
											step="0.01"
											oninput={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const value = Number.isFinite(next) ? next : 0;
												actions.setAccountInterestRate(account.id, value);
											}}
											onkeydown={(event) => {
												const keyboardEvent = event as KeyboardEvent;
												if (keyboardEvent.key === 'ArrowUp') {
													keyboardEvent.preventDefault();
													actions.adjustAccountInterestRate(account.id, 0.25);
												}
												if (keyboardEvent.key === 'ArrowDown') {
													keyboardEvent.preventDefault();
													actions.adjustAccountInterestRate(account.id, -0.25);
												}
											}}
											onchange={(event) => {
												const next = Number((event.currentTarget as HTMLInputElement).value);
												const value = Number.isFinite(next) ? ui.roundToTwo(next) : 0;
												actions.setAccountInterestRate(account.id, value);
												ui.scheduleUpdate(`account:${account.id}`, () =>
													actions.updateAccountInterestRate(account.id, value)
												);
											}}
										/>
										<div class="flex flex-col items-end gap-0.5">
											<button
												type="button"
												class="grid h-3.5 w-5 place-items-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600 hover:bg-slate-50"
												aria-label={`Increase ${account.name} interest rate`}
												onclick={() => actions.adjustAccountInterestRate(account.id, 0.25)}
											>
												▲
											</button>
											<button
												type="button"
												class="grid h-3.5 w-5 place-items-center rounded border border-slate-200 bg-white text-[10px] leading-none text-slate-600 hover:bg-slate-50"
												aria-label={`Decrease ${account.name} interest rate`}
												onclick={() => actions.adjustAccountInterestRate(account.id, -0.25)}
											>
												▼
											</button>
										</div>
									</div>
								{/if}
							</td>
							<td class="app-cell">{ui.formatLabel(account.account_type)}</td>
						</tr>
					{/each}
				</tbody>
			</AppTable>
		</div>
		{#if data.accountInlineError}
			<StatusMessage tone="error" class="mt-2">{data.accountInlineError}</StatusMessage>
		{/if}
	{:else}
		<div class="app-text-muted">No accounts to show yet.</div>
	{/if}
</div>

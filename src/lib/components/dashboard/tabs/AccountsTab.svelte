<script lang="ts">
	import type { AccountsTabProps } from './types';

	let { data, actions, ui }: AccountsTabProps = $props();
</script>

<div class="mt-3 flex flex-wrap gap-2">
	<a
		href="/accounts/create"
		class="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
	>
		Add account
	</a>
</div>
<div class="mt-5 rounded-xl border border-slate-200 bg-white p-3">
	{#if data.accountsList.length > 0}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead class="bg-slate-50 text-left text-slate-500 uppercase">
					<tr>
						<th class="px-2 py-2">Start</th>
						<th class="px-2 py-2">Name</th>
						<th class="px-2 py-2">Opening balance</th>
						<th class="px-2 py-2">Interest rate</th>
						<th class="px-2 py-2">Account type</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					{#each data.accountsList as account}
						{@const draft = data.accountEditDrafts[account.id]}
						<tr>
							<td class="px-2 py-2">
								<input
									type="text"
									inputmode="numeric"
									pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
									class="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
									value={draft?.startDate ?? ui.toMonthYearInput(account.start_date)}
									oninput={(event) =>
										actions.setAccountEditDraft(account.id, {
											startDate: (event.currentTarget as HTMLInputElement).value
										})}
									onchange={() =>
										ui.scheduleUpdate(`account-edit:${account.id}`, () => actions.saveAccountEditDraft(account.id))}
								/>
							</td>
							<td class="px-2 py-2">
								<input
									type="text"
									class="w-44 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
									value={draft?.name ?? account.name}
									oninput={(event) =>
										actions.setAccountEditDraft(account.id, {
											name: (event.currentTarget as HTMLInputElement).value
										})}
									onchange={() =>
										ui.scheduleUpdate(`account-edit:${account.id}`, () => actions.saveAccountEditDraft(account.id))}
								/>
							</td>
							<td class="px-2 py-2">
								<input
									type="number"
									step="0.01"
									class="no-spin w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
									value={draft?.openingBalance ?? String(account.opening_balance)}
									oninput={(event) =>
										actions.setAccountEditDraft(account.id, {
											openingBalance: (event.currentTarget as HTMLInputElement).value
										})}
									onchange={() =>
										ui.scheduleUpdate(`account-edit:${account.id}`, () => actions.saveAccountEditDraft(account.id))}
								/>
							</td>
							<td class="px-2 py-2">
								{#if account.account_type === 'super_account' || account.account_type === 'brokerage'}
									<span class="text-slate-400">—</span>
								{:else}
									<div class="flex items-center gap-1">
										<input
											type="number"
											class="no-spin w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
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
							<td class="px-2 py-2">{ui.formatLabel(account.account_type)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.accountInlineError}
			<div class="mt-2 text-xs text-rose-600">{data.accountInlineError}</div>
		{/if}
	{:else}
		<div class="text-sm text-slate-600">No accounts to show yet.</div>
	{/if}
</div>

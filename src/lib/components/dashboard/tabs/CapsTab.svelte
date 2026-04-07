<script lang="ts">
	import type { CapsTabProps } from './types';

	let { data, actions, ui }: CapsTabProps = $props();
</script>

<div class="mt-5 space-y-4">
	{#if data.fundingCashAccountOptions.length === 0}
		<div class="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
			No eligible cash accounts available yet.
		</div>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
			<table class="min-w-full divide-y divide-slate-200 text-xs">
				<thead class="bg-slate-50 text-left uppercase text-slate-500">
					<tr>
						<th class="px-2 py-2 text-slate-600 normal-case">Cash accounts</th>
						{#each data.fundingCashAccountOptions as account (account.id)}
							<th class="px-2 py-2 text-slate-700 normal-case">{account.name}</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100 text-slate-700">
					<tr>
						<td class="px-2 py-2 font-semibold text-slate-600">Cap amount</td>
						{#each data.fundingCashAccountOptions as account (account.id)}
							<td class="px-2 py-2">
								<input
									id={`cap-amount-input-${account.id}`}
									type="number"
									class="w-full min-w-[120px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
									value={data.fundingCapDrafts[account.id] ?? ''}
									oninput={(event) =>
										actions.setFundingCapDraft(account.id, (event.currentTarget as HTMLInputElement).value)}
									onchange={() =>
										ui.scheduleUpdate(`funding-target:${account.id}`, () =>
											actions.upsertFundingTargetForAccount(account.id)
										)}
								/>
							</td>
						{/each}
					</tr>
					<tr>
						<td colspan={data.fundingCashAccountOptions.length + 1} class="px-2 py-2 text-xs text-sky-800">
							Once the account has reached its cap, select the assets or accounts to fund in order.
							Select at least one destination before entering the cap.
						</td>
					</tr>
					{#each Array.from({ length: data.fundingCapPriorityRowCount }) as _, priorityIndex (priorityIndex)}
						{@const priority = priorityIndex + 1}
						<tr>
							<td class="px-2 py-2 font-semibold text-slate-600">
								Funding destination priority {priority}
							</td>
							{#each data.fundingCashAccountOptions as account (account.id)}
								{@const accountSweepRules = data.fundingSweepRulesByAccount[account.id] ?? []}
								{@const rule = accountSweepRules[priorityIndex] ?? null}
								{@const canSelectDestination =
									priorityIndex === 0 || Boolean(accountSweepRules[priorityIndex - 1])}
								{@const capAmountEntered = (data.fundingCapDrafts[account.id] ?? '').trim().length > 0}
								{@const showCapDestinationWarning =
									priorityIndex === 0 && capAmountEntered && !accountSweepRules[0]}
								{@const availableSweepDestinationOptions =
									data.fundingSweepDestinationOptionsByAccount[account.id] ?? []}
								<td class="px-2 py-2">
									{#if rule}
										{@const destinationName =
											data.transferAccountOptions.find(
												(item) => item.id === rule.destination_account_id
											)?.name ?? 'Destination account'}
										<div class="flex min-w-[160px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
											<span class="flex-1 truncate">{destinationName}</span>
											<button
												type="button"
												class="px-1 text-slate-500 disabled:opacity-30"
												disabled={priority === 1}
												onclick={() => actions.moveSweepRule(account.id, rule.id, -1)}
											>
												↑
											</button>
											<button
												type="button"
												class="px-1 text-slate-500 disabled:opacity-30"
												disabled={priorityIndex === accountSweepRules.length - 1}
												onclick={() => actions.moveSweepRule(account.id, rule.id, 1)}
											>
												↓
											</button>
											<button
												type="button"
												class="px-1 text-rose-600"
												onclick={() => actions.removeSweepRule(rule.id)}
											>
												✕
											</button>
										</div>
									{:else if canSelectDestination && availableSweepDestinationOptions.length > 0}
										<select
											class="w-full min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
											value=""
											onchange={(event) => {
												const selectedDestination = (event.currentTarget as HTMLSelectElement).value;
												if (selectedDestination) {
													void actions.addSweepRuleForSource(account.id, selectedDestination);
													(event.currentTarget as HTMLSelectElement).value = '';
												}
											}}
										>
											<option value="">Select destination…</option>
											{#each availableSweepDestinationOptions as option}
												<option value={option.id}>{option.name}</option>
											{/each}
										</select>
									{:else if canSelectDestination}
										<div class="min-w-[160px] text-center text-slate-400">
											No more funding destinations available
										</div>
									{:else}
										<div class="min-w-[160px] text-center text-slate-400">-</div>
									{/if}
									{#if showCapDestinationWarning}
										<div class="mt-1 text-[11px] text-rose-600">
											Please choose where excess funds should be allocated for cap to take effect.
										</div>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.fundingTabError}
			<div class="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
				{data.fundingTabError}
			</div>
		{/if}
	{/if}
</div>

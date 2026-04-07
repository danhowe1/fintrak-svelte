<script lang="ts">
	import type { ReservesTabProps } from './types';

	let { data, actions, ui }: ReservesTabProps = $props();
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
						<td class="px-2 py-2 font-semibold text-slate-600">Reserve amount</td>
						{#each data.fundingCashAccountOptions as account (account.id)}
							<td class="px-2 py-2">
								<input
									id={`reserve-amount-input-${account.id}`}
									type="number"
									class="w-full min-w-[120px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
									value={data.fundingReserveDrafts[account.id] ?? '0'}
									oninput={(event) =>
										actions.setFundingReserveDraft(
											account.id,
											(event.currentTarget as HTMLInputElement).value
										)}
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
							Select the assets or accounts to fund the account from once it falls below its reserve.
						</td>
					</tr>
					{#each Array.from({ length: data.fundingReservePriorityRowCount }) as _, priorityIndex (priorityIndex)}
						{@const priority = priorityIndex + 1}
						<tr>
							<td class="px-2 py-2 font-semibold text-slate-600">Funding source priority {priority}</td>
							{#each data.fundingCashAccountOptions as account (account.id)}
								{@const accountReserveRules = data.fundingReserveRulesByAccount[account.id] ?? []}
								{@const rule = accountReserveRules[priorityIndex] ?? null}
								{@const canSelectSource =
									priorityIndex === 0 || Boolean(accountReserveRules[priorityIndex - 1])}
								{@const availableReserveSourceOptions =
									data.fundingReserveSourceOptionsByAccount[account.id] ?? []}
								<td class="px-2 py-2">
									{#if rule}
										{@const sourceName =
											data.transferAccountOptions.find(
												(item) => item.id === rule.source_account_id
											)?.name ?? 'Source account'}
										<div class="flex min-w-[160px] items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
											<span class="flex-1 truncate">{sourceName}</span>
											<button
												type="button"
												class="px-1 text-slate-500 disabled:opacity-30"
												disabled={priority === 1}
												onclick={() => actions.moveReserveRule(account.id, rule.id, -1)}
											>
												↑
											</button>
											<button
												type="button"
												class="px-1 text-slate-500 disabled:opacity-30"
												disabled={priorityIndex === accountReserveRules.length - 1}
												onclick={() => actions.moveReserveRule(account.id, rule.id, 1)}
											>
												↓
											</button>
											<button
												type="button"
												class="px-1 text-rose-600"
												onclick={() => actions.removeReserveRule(rule.id)}
											>
												✕
											</button>
										</div>
									{:else if canSelectSource && availableReserveSourceOptions.length > 0}
										<select
											class="w-full min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900"
											value=""
											onchange={(event) => {
												const selectedSource = (event.currentTarget as HTMLSelectElement).value;
												if (selectedSource) {
													void actions.addReserveRuleForTarget(account.id, selectedSource);
													(event.currentTarget as HTMLSelectElement).value = '';
												}
											}}
										>
											<option value="">Select source…</option>
											{#each availableReserveSourceOptions as option}
												<option value={option.id}>{option.name}</option>
											{/each}
										</select>
									{:else if canSelectSource}
										<div class="min-w-[160px] text-center text-slate-400">
											No more funding sources available
										</div>
									{:else}
										<div class="min-w-[160px] text-center text-slate-400">-</div>
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

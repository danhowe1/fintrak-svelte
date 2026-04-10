<script lang="ts">
	import FormRow from '$lib/components/ui/FormRow.svelte';
	import InlineError from '$lib/components/ui/InlineError.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type CashflowDraftModel = {
		type: 'income' | 'expense';
		category:
			| 'living_expenses'
			| 'employment_income'
			| 'misc_income'
			| 'asset_ownership'
			| 'rental_income';
		frequency: 'monthly' | 'quarterly' | 'annually' | 'one_time';
		amount: string;
		description: string;
		startDate: string;
		endDate: string;
		inflationAffected: boolean;
		assetAccountId: string;
	};

	type Option = { value: string; label: string };
	type AccountOption = { id: string; name: string };

	let {
		draft,
		isEdit,
		categoryOptions,
		frequencyOptions,
		assetAccountOptions,
		error = '',
		amountStep,
		onUpdate,
		onDismiss,
		onSubmit
	} = $props<{
		draft: CashflowDraftModel;
		isEdit: boolean;
		categoryOptions: Option[];
		frequencyOptions: Option[];
		assetAccountOptions: AccountOption[];
		error?: string;
		amountStep: number;
		onUpdate: (updates: Partial<CashflowDraftModel>) => void;
		onDismiss: () => void;
		onSubmit?: () => void;
	}>();
</script>

<div class="mt-3 rounded-lg border border-slate-200 bg-white p-3">
	<div class="text-xs font-semibold text-slate-700">
		{isEdit ? 'Edit' : 'New'}
		{draft.type === 'income' ? 'Income' : 'Expense'}
	</div>
	<FormRow label="Category">
		<select
			class="app-input-block-compact"
			value={draft.category}
			disabled={categoryOptions.length === 1}
			onchange={(event) =>
				onUpdate({
					category: (event.currentTarget as HTMLSelectElement)
						.value as CashflowDraftModel['category']
				})}
		>
			{#each categoryOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</FormRow>
	<FormRow label="Description">
		<input
			type="text"
			class="app-input-block-compact"
			value={draft.description}
			oninput={(event) =>
				onUpdate({ description: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	{#if !isEdit}
		<FormRow label="Amount">
			<input
				type="number"
				class="app-input-block-compact"
				value={draft.amount}
				step={amountStep}
				oninput={(event) => onUpdate({ amount: (event.currentTarget as HTMLInputElement).value })}
			/>
		</FormRow>
	{/if}
	<FormRow label="Start (MM YYYY)">
		<input
			type="text"
			inputmode="numeric"
			pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
			class="app-input-block-compact"
			value={draft.startDate}
			oninput={(event) => onUpdate({ startDate: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	<FormRow label="End (MM YYYY)">
		<input
			type="text"
			inputmode="numeric"
			pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
			class="app-input-block-compact"
			value={draft.endDate}
			oninput={(event) => onUpdate({ endDate: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	<FormRow label="Frequency">
		<select
			class="app-input-block-compact"
			value={draft.frequency}
			onchange={(event) =>
				onUpdate({
					frequency: (event.currentTarget as HTMLSelectElement)
						.value as CashflowDraftModel['frequency']
				})}
		>
			{#each frequencyOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</FormRow>
	<FormRow label="Account">
		<select
			class="app-input-block-compact"
			value={draft.assetAccountId}
			onchange={(event) =>
				onUpdate({ assetAccountId: (event.currentTarget as HTMLSelectElement).value })}
		>
			{#each assetAccountOptions as option}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	</FormRow>
	<FormRow label="Inflation affected">
		<div class="flex w-full justify-start">
			<input
				type="checkbox"
				checked={draft.inflationAffected}
				onchange={(event) =>
					onUpdate({ inflationAffected: (event.currentTarget as HTMLInputElement).checked })}
				class="h-4 w-4 accent-slate-600"
			/>
		</div>
	</FormRow>
	{#if error}
		<InlineError message={error} />
	{/if}
	<div class="mt-3 flex items-center gap-2">
		<Button
			type="button"
			variant="secondary"
			size="xs"
			class="border-slate-200 text-slate-600"
			onclick={onDismiss}
		>
			{isEdit ? 'Close' : 'Cancel'}
		</Button>
		{#if !isEdit}
			<Button
				type="button"
				variant="primary"
				size="xs"
				disabled={!draft.assetAccountId}
				onclick={onSubmit}
			>
				Add
			</Button>
		{/if}
	</div>
</div>

<script lang="ts">
	import FormRow from '$lib/components/ui/FormRow.svelte';
	import InlineError from '$lib/components/ui/InlineError.svelte';

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
		onCancel,
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
		onCancel: () => void;
		onSubmit: () => void;
	}>();
</script>

<div class="mt-3 rounded-lg border border-slate-200 bg-white p-3">
	<div class="text-xs font-semibold text-slate-700">
		{isEdit ? 'Edit' : 'New'} {draft.type === 'income' ? 'Income' : 'Expense'}
	</div>
	<FormRow label="Category">
		<select
			class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.category}
			disabled={categoryOptions.length === 1}
			onchange={(event) =>
				onUpdate({
					category: (event.currentTarget as HTMLSelectElement).value as CashflowDraftModel['category']
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
			class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.description}
			oninput={(event) => onUpdate({ description: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	<FormRow label="Amount">
		<input
			type="number"
			class="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.amount}
			step={amountStep}
			oninput={(event) => onUpdate({ amount: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	<FormRow label="Start (MM YYYY)">
		<input
			type="text"
			inputmode="numeric"
			pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
			class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.startDate}
			oninput={(event) => onUpdate({ startDate: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	<FormRow label="End (MM YYYY)">
		<input
			type="text"
			inputmode="numeric"
			pattern="^(0[1-9]|1[0-2])(\\s|/|-)?\\d{4}$"
			class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.endDate}
			oninput={(event) => onUpdate({ endDate: (event.currentTarget as HTMLInputElement).value })}
		/>
	</FormRow>
	<FormRow label="Frequency">
		<select
			class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.frequency}
			onchange={(event) =>
				onUpdate({ frequency: (event.currentTarget as HTMLSelectElement).value as CashflowDraftModel['frequency'] })}
		>
			{#each frequencyOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</FormRow>
	<FormRow label="Account">
		<select
			class="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
			value={draft.assetAccountId}
			onchange={(event) =>
				onUpdate({ assetAccountId: (event.currentTarget as HTMLSelectElement).value })}
		>
			{#each assetAccountOptions as option}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	</FormRow>
	<label class="mt-2 flex items-center gap-2 text-xs text-slate-600">
		<input
			type="checkbox"
			checked={draft.inflationAffected}
			onchange={(event) =>
				onUpdate({ inflationAffected: (event.currentTarget as HTMLInputElement).checked })}
			class="h-4 w-4 accent-slate-600"
		/>
		<span class="text-slate-500">Inflation affected</span>
	</label>
	{#if error}
		<InlineError message={error} />
	{/if}
	<div class="mt-3 flex items-center gap-2">
		<button
			type="button"
			class="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
			onclick={onCancel}
		>
			Cancel
		</button>
		<button
			type="button"
			class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
			disabled={!draft.assetAccountId}
			onclick={onSubmit}
		>
			{isEdit ? 'Save' : 'Add'}
		</button>
	</div>
</div>

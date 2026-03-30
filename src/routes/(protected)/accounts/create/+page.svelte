<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount, tick } from 'svelte';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data: PageData;
	export let form: ActionData;

	const formErrors = (form?.errors ?? {}) as Record<string, string[]>;
	const formValues = (form?.values ?? {}) as Record<string, string>;

	const selectedPersonIds = Array.isArray(form?.values?.personIds)
		? form?.values?.personIds
		: null;

	let accountTypeSelect: HTMLSelectElement | null = null;

	onMount(async () => {
		await tick();
		accountTypeSelect?.focus();
	});
</script>

<h1>Create account</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<style>
		.no-spin::-webkit-outer-spin-button,
		.no-spin::-webkit-inner-spin-button {
			-webkit-appearance: none;
			margin: 0;
		}
		.no-spin {
			-moz-appearance: textfield;
		}
	</style>
	<form method="POST" class="grid gap-6">
		<FormSection title="Account details">
			<div class="grid gap-4 md:grid-cols-4">
				<label class="grid gap-2 text-sm font-medium text-slate-700">
					Type
					<select
						name="accountType"
						bind:this={accountTypeSelect}
						class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
						required
						value={formValues.accountType ?? 'current_account'}
					>
						<option value="current_account">Current account</option>
						<option value="savings_account">Savings account</option>
						<option value="credit_card">Credit card</option>
					</select>
					{#if formErrors.accountType?.[0]}
						<span class="text-xs text-rose-600">{formErrors.accountType[0]}</span>
					{/if}
				</label>

				<FormField
					label="Account name"
					name="name"
					value={formValues.name ?? ''}
					error={formErrors.name?.[0]}
					required
				/>

				<FormField
					type="number"
					label="Interest rate (%)"
					name="interestRate"
					step="0.01"
					value={formValues.interestRate ?? ''}
					error={formErrors.interestRate?.[0]}
					required
					class="no-spin"
				/>

				<FormField
					type="number"
					label="Opening balance"
					name="openingBalance"
					step="0.01"
					value={formValues.openingBalance ?? ''}
					error={formErrors.openingBalance?.[0]}
					required
					class="no-spin"
				/>
			</div>
		</FormSection>

		<FormSection title="Account holders">
			{#if data.people.length === 0}
				<p class="text-sm text-slate-600">No people available to assign to this account.</p>
			{:else}
				<div class="flex flex-wrap items-center gap-4 text-sm text-slate-700">
					{#each data.people as person}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name="personIds"
								value={person.id}
								checked={(selectedPersonIds ?? data.people.map((p) => p.id)).includes(person.id)}
								class="h-4 w-4 rounded border-slate-300 text-slate-900"
							/>
							<span>{person.name}</span>
						</label>
					{/each}
				</div>
				{#if form?.errors?.personIds?.[0]}
					<span class="text-xs text-rose-600">{form.errors.personIds[0]}</span>
				{/if}
			{/if}
		</FormSection>

		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" class="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
				Create account
			</Button>
			<a class="text-sm font-semibold text-slate-600 hover:text-slate-900" href="/accounts">
				Cancel
			</a>
		</div>
	</form>
</section>

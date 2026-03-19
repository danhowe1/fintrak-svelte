<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data: PageData;
	export let form: ActionData;
</script>

<h1>Create account</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<form method="POST" class="grid gap-6">
		<FormSection title="Account details">
			<label class="grid gap-2 text-sm font-medium text-slate-700">
				Type
				<select
					name="accountType"
					class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
					required
					value={form?.values?.accountType ?? 'current_account'}
				>
					<option value="current_account">Current account</option>
					<option value="savings_account">Savings account</option>
					<option value="credit_card">Credit card</option>
					<option value="mortgage_account">Mortgage account</option>
					<option value="brokerage">Brokerage</option>
					<option value="super_account">Super account</option>
				</select>
				{#if form?.errors?.accountType?.[0]}
					<span class="text-xs text-rose-600">{form.errors.accountType[0]}</span>
				{/if}
			</label>

			<FormField
				label="Account name"
				name="name"
				placeholder="Everyday Account"
				value={form?.values?.name ?? ''}
				error={form?.errors?.name?.[0]}
				required
			/>
		</FormSection>

		<FormSection title="Balances">
			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="number"
					label="Interest rate (%)"
					name="interestRate"
					step="0.1"
					placeholder="1.5"
					value={form?.values?.interestRate ?? ''}
					error={form?.errors?.interestRate?.[0]}
					required
				/>

				<FormField
					type="number"
					label="Opening balance"
					name="openingBalance"
					step="0.01"
					placeholder="10000"
					value={form?.values?.openingBalance ?? ''}
					error={form?.errors?.openingBalance?.[0]}
					required
				/>
			</div>
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

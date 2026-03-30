<script lang="ts">
	import type { ActionData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';

	export let form: ActionData;

	const now = new Date();
	const defaultStartMonth = (() => {
		const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const year = firstOfMonth.getFullYear();
		const month = String(firstOfMonth.getMonth() + 1).padStart(2, '0');
		return `${month} ${year}`;
	})();
</script>

<h1>Create Scenario</h1>
<p>No scenarios were found for your account.</p>
<p>Create your first scenario here to start modelling accounts, assets, and ownership.</p>

<section class="not-prose mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
	<h2 class="text-lg font-semibold text-slate-900">Scenario setup</h2>
	<p class="mt-2 text-sm text-slate-600">
		Enter the scenario details and the first person asset. Inflation defaults to 2.0% and interest
		rate change defaults to 0.00%.
	</p>

	<form method="POST" class="mt-6 grid gap-6">
		<FormSection title="Scenario details">
			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					label="Scenario name"
					name="scenarioName"
					value={form?.values?.scenarioName ?? ''}
					error={form?.errors?.scenarioName?.[0]}
					required
					autofocus
				/>
			</div>

			<!-- Rates defaulted server-side; no user input required. -->
		</FormSection>

		<FormSection title="First family member">
			<div class="grid gap-4 md:grid-cols-3">
				<FormField
					type="text"
					label="Start month"
					name="personStartDate"
					inputmode="numeric"
					value={form?.values?.personStartDate ?? defaultStartMonth}
					error={form?.errors?.personStartDate?.[0]}
					required
				/>

				<FormField
					label="Name"
					name="personName"
					value={form?.values?.personName ?? ''}
					error={form?.errors?.personName?.[0]}
					required
				/>

				<FormField
					type="text"
					label="Date of birth (MM YYYY)"
					name="personDob"
					inputmode="numeric"
					value={form?.values?.personDob ?? ''}
					error={form?.errors?.personDob?.[0]}
					required
				/>

				<FormField
					type="number"
					label="Retirement age"
					name="retirementAge"
					min="0"
					step="1"
					value={form?.values?.retirementAge ?? ''}
					error={form?.errors?.retirementAge?.[0]}
					required
					class="no-spin"
				/>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="number"
					label="Monthly net income"
					name="monthlyNetIncome"
					step="0.01"
					value={form?.values?.monthlyNetIncome ?? ''}
					error={form?.errors?.monthlyNetIncome?.[0]}
					class="no-spin"
				/>

				<FormField
					type="number"
					label="Monthly essential living expenses"
					name="monthlyEssentialExpenses"
					step="0.01"
					value={form?.values?.monthlyEssentialExpenses ?? ''}
					error={form?.errors?.monthlyEssentialExpenses?.[0]}
					required
					class="no-spin"
				/>
			</div>
		</FormSection>

		<FormSection title="Default cash account">
			<div class="grid gap-4 md:grid-cols-3">
				<FormField
					label="Account name"
					name="accountName"
					value={form?.values?.accountName ?? ''}
					error={form?.errors?.accountName?.[0]}
					required
				/>

				<FormField
					type="number"
					label="Interest rate (%)"
					name="accountInterestRate"
					step="0.01"
					value={form?.values?.accountInterestRate ?? ''}
					error={form?.errors?.accountInterestRate?.[0]}
					required
					class="no-spin"
				/>

				<FormField
					type="number"
					label="Opening balance"
					name="openingBalance"
					step="0.01"
					value={form?.values?.openingBalance ?? ''}
					error={form?.errors?.openingBalance?.[0]}
					required
					class="no-spin"
				/>
			</div>
		</FormSection>

		<Button type="submit" class="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
			Create scenario
		</Button>
	</form>
</section>

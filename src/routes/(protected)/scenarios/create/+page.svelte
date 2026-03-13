<script lang="ts">
	import type { ActionData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';

	export let form: ActionData;

	const now = new Date();
	const defaultStartDate = (() => {
		const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const year = firstOfMonth.getFullYear();
		const month = String(firstOfMonth.getMonth() + 1).padStart(2, '0');
		const day = String(firstOfMonth.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	})();
</script>

<h1>Create Scenario</h1>
<p>No scenarios were found for your account.</p>
<p>Create your first scenario here to start modelling accounts, assets, and ownership.</p>

<section class="not-prose mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	<h2 class="text-lg font-semibold text-slate-900">Scenario setup</h2>
	<p class="mt-2 text-sm text-slate-600">
		Enter the scenario assumptions and the first person asset. All rates are stored with 1
		decimal place.
	</p>

	<form method="POST" class="mt-6 grid gap-6">
		<FormSection title="Scenario details">
			<FormField
				label="Scenario name"
				name="scenarioName"
				placeholder="Base case"
				value={form?.values?.scenarioName ?? ''}
				error={form?.errors?.scenarioName?.[0]}
				required
			/>

			<FormField
				type="date"
				label="Start date"
				name="startDate"
				value={form?.values?.startDate ?? defaultStartDate}
				error={form?.errors?.startDate?.[0]}
				required
			/>

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="number"
					label="Inflation rate (%)"
					name="inflationRate"
					step="0.1"
					placeholder="2.5"
					value={form?.values?.inflationRate ?? ''}
					error={form?.errors?.inflationRate?.[0]}
					required
				/>

				<FormField
					type="number"
					label="Interest rate rise (%)"
					name="interestRateRise"
					step="0.1"
					placeholder="0.5"
					value={form?.values?.interestRateRise ?? ''}
					error={form?.errors?.interestRateRise?.[0]}
					required
				/>
			</div>
		</FormSection>

		<FormSection title="Person asset">
			<FormField
				label="Name"
				name="personName"
				placeholder="Alex Johnson"
				value={form?.values?.personName ?? ''}
				error={form?.errors?.personName?.[0]}
				required
			/>

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="date"
					label="Date of birth"
					name="personDob"
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
					placeholder="65"
					value={form?.values?.retirementAge ?? ''}
					error={form?.errors?.retirementAge?.[0]}
					required
				/>
			</div>
		</FormSection>

		<FormSection title="Default current account">
			<FormField
				label="Account name"
				name="accountName"
				placeholder="Everyday Account"
				value={form?.values?.accountName ?? ''}
				error={form?.errors?.accountName?.[0]}
				required
			/>

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="number"
					label="Interest rate (%)"
					name="accountInterestRate"
					step="0.1"
					placeholder="1.5"
					value={form?.values?.accountInterestRate ?? ''}
					error={form?.errors?.accountInterestRate?.[0]}
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

		<Button type="submit" class="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
			Create scenario
		</Button>
	</form>
</section>

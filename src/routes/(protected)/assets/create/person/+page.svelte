<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data: PageData;
	export let form: ActionData;

	let incomeAccountChoice = (form?.values?.incomeAccountChoice as string) ?? '';
	let expenseAccountChoice = (form?.values?.expenseAccountChoice as string) ?? '';
	let useSameAccount = (form?.values?.useSameAccount as string) === 'on';

	const now = new Date();
	const defaultMonth = (() => {
		const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const year = firstOfMonth.getFullYear();
		const month = String(firstOfMonth.getMonth() + 1).padStart(2, '0');
		return `${month} ${year}`;
	})();
</script>

<h1>Create person</h1>
<p class="text-sm text-slate-600">Scenario: {data.scenario.name}</p>

<section class="not-prose mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
	{#if form?.formError}
		<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
			{form.formError}
		</div>
	{/if}
	{#if form?.errors}
		{#if Object.keys(form.errors).length > 0}
			<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
				<p class="font-semibold">Please fix the highlighted fields below.</p>
				<ul class="mt-2 list-disc pl-5">
					{#each Object.entries(form.errors) as [field, messages]}
						{#if messages?.[0]}
							<li>
								<span class="font-semibold">{field}</span>: {messages[0]}
							</li>
						{/if}
					{/each}
				</ul>
			</div>
		{/if}
	{/if}

	<form method="POST" class="grid gap-6">
		<FormSection title="Person details">
			<FormField
				label="Name"
				name="name"
				placeholder="Alex Johnson"
				value={form?.values?.name ?? ''}
				error={form?.errors?.name?.[0]}
				required
			/>

			<FormField
				type="text"
				label="Start month"
				name="startMonth"
				placeholder="MM YYYY"
				inputmode="numeric"
				value={form?.values?.startMonth ?? defaultMonth}
				error={form?.errors?.startMonth?.[0]}
				required
			/>

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="text"
					label="Date of birth (MM YYYY)"
					name="personDob"
					placeholder="MM YYYY"
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
					placeholder="65"
					value={form?.values?.retirementAge ?? ''}
					error={form?.errors?.retirementAge?.[0]}
					required
				/>
			</div>
		</FormSection>

		<FormSection title="Employment income">
			<FormField
				type="number"
				label="Monthly employment income"
				name="employmentIncome"
				step="0.01"
				placeholder="5000"
				value={form?.values?.employmentIncome ?? ''}
				error={form?.errors?.employmentIncome?.[0]}
				required
			/>

			<label class="grid gap-2 text-sm font-medium text-slate-700">
				Income account
				<select
					name="incomeAccountChoice"
					class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
					required
					bind:value={incomeAccountChoice}
				>
					<option value="" disabled selected={incomeAccountChoice === ''}>
						Select an account
					</option>
					<option value="new">Create new account</option>
					{#each data.accounts as account}
						<option value={account.id}>{account.name}</option>
					{/each}
				</select>
				{#if form?.errors?.incomeAccountChoice?.[0]}
					<span class="text-xs text-rose-600">{form.errors.incomeAccountChoice[0]}</span>
				{/if}
			</label>

			{#if incomeAccountChoice === 'new'}
				<div class="grid gap-4 md:grid-cols-3">
					<FormField
						label="Account name"
						name="incomeAccountName"
						placeholder="Income account"
						value={form?.values?.incomeAccountName ?? ''}
						error={form?.errors?.incomeAccountName?.[0]}
						required
					/>
					<FormField
						type="number"
						label="Interest rate (%)"
						name="incomeAccountInterestRate"
						step="0.1"
						placeholder="1.5"
						value={form?.values?.incomeAccountInterestRate ?? ''}
						error={form?.errors?.incomeAccountInterestRate?.[0]}
						required
					/>
					<FormField
						type="number"
						label="Opening balance"
						name="incomeAccountOpeningBalance"
						step="0.01"
						placeholder="0"
						value={form?.values?.incomeAccountOpeningBalance ?? ''}
						error={form?.errors?.incomeAccountOpeningBalance?.[0]}
						required
					/>
				</div>
			{/if}
		</FormSection>

		<FormSection title="Essential living expenses">
			<FormField
				type="number"
				label="Monthly essential expenses"
				name="essentialExpenses"
				step="0.01"
				placeholder="2500"
				value={form?.values?.essentialExpenses ?? ''}
				error={form?.errors?.essentialExpenses?.[0]}
				required
			/>

			<label class="flex items-center gap-2 text-sm font-medium text-slate-700">
				<input
					type="checkbox"
					name="useSameAccount"
					bind:checked={useSameAccount}
					class="h-4 w-4 rounded border-slate-300 text-slate-900"
				/>
				Use same account as income
			</label>

			{#if useSameAccount}
				<input type="hidden" name="expenseAccountChoice" value={incomeAccountChoice} />
				{#if incomeAccountChoice === 'new'}
					<input
						type="hidden"
						name="expenseAccountName"
						value={form?.values?.incomeAccountName ?? ''}
					/>
					<input
						type="hidden"
						name="expenseAccountInterestRate"
						value={form?.values?.incomeAccountInterestRate ?? ''}
					/>
					<input
						type="hidden"
						name="expenseAccountOpeningBalance"
						value={form?.values?.incomeAccountOpeningBalance ?? ''}
					/>
				{/if}
			{:else}
				<label class="grid gap-2 text-sm font-medium text-slate-700">
					Expenses account
					<select
						name="expenseAccountChoice"
						class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
						required
						bind:value={expenseAccountChoice}
					>
						<option value="" disabled selected={expenseAccountChoice === ''}>
							Select an account
						</option>
						<option value="new">Create new account</option>
						{#each data.accounts as account}
							<option value={account.id}>{account.name}</option>
						{/each}
					</select>
					{#if form?.errors?.expenseAccountChoice?.[0]}
						<span class="text-xs text-rose-600">{form.errors.expenseAccountChoice[0]}</span>
					{/if}
				</label>

				{#if expenseAccountChoice === 'new'}
					<div class="grid gap-4 md:grid-cols-3">
						<FormField
							label="Account name"
							name="expenseAccountName"
							placeholder="Expenses account"
							value={form?.values?.expenseAccountName ?? ''}
							error={form?.errors?.expenseAccountName?.[0]}
							required
						/>
						<FormField
							type="number"
							label="Interest rate (%)"
							name="expenseAccountInterestRate"
							step="0.1"
							placeholder="1.5"
							value={form?.values?.expenseAccountInterestRate ?? ''}
							error={form?.errors?.expenseAccountInterestRate?.[0]}
							required
						/>
						<FormField
							type="number"
							label="Opening balance"
							name="expenseAccountOpeningBalance"
							step="0.01"
							placeholder="0"
							value={form?.values?.expenseAccountOpeningBalance ?? ''}
							error={form?.errors?.expenseAccountOpeningBalance?.[0]}
							required
						/>
					</div>
				{/if}
			{/if}
		</FormSection>

		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" class="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
				Create person
			</Button>
			<a class="text-sm font-semibold text-slate-600 hover:text-slate-900" href="/assets">
				Cancel
			</a>
		</div>
	</form>
</section>

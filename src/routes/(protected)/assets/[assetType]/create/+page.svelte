<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let data: PageData;
	export let form: ActionData;

	const selectedType = (form?.values?.assetType as string) ?? data.assetType;
	const assetTypeLabel = selectedType.replace(/_/g, ' ').toUpperCase();
	let incomeAccountChoice = (form?.values?.incomeAccountChoice as string) ?? '';
	let expenseAccountChoice = (form?.values?.expenseAccountChoice as string) ?? '';
	let useSameAccount =
		(form?.values?.useSameAccount as string) === 'on' || form?.values?.useSameAccount == null;
	let mortgagePaymentSourceChoice = (form?.values?.mortgagePaymentSourceChoice as string) ?? '';
	let mortgageOffsetChoice = (form?.values?.mortgageOffsetChoice as string) ?? 'none';
	let mortgageInterestOnly = (form?.values?.mortgageInterestOnly as string) === 'on';

	const now = new Date();
	const defaultMonth = (() => {
		const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const year = firstOfMonth.getFullYear();
		const month = String(firstOfMonth.getMonth() + 1).padStart(2, '0');
		return `${month} ${year}`;
	})();
</script>

<h1>Create asset</h1>
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
		<FormSection title="Overview">
			<input type="hidden" name="assetType" value={selectedType} />

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					type="text"
					label="Start month"
					name="startMonth"
					inputmode="numeric"
					value={form?.values?.startMonth ?? defaultMonth}
					error={form?.errors?.startMonth?.[0]}
					required
				/>

				<FormField
					label="Name"
					name="name"
					value={form?.values?.name ?? ''}
					error={form?.errors?.name?.[0]}
					required
					autofocus
				/>
			</div>
		</FormSection>

		{#if selectedType === 'person'}
			<FormSection title={`${assetTypeLabel} DETAILS`}>
				<div class="grid gap-4 md:grid-cols-2">
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
						class="no-spin"
						label="Retirement age"
						name="retirementAge"
						min="0"
						step="1"
						value={form?.values?.retirementAge ?? ''}
						error={form?.errors?.retirementAge?.[0]}
						required
					/>
				</div>
			</FormSection>
		{/if}

		{#if selectedType === 'property'}
			<FormSection title={`${assetTypeLabel} DETAILS`}>
				<div class="grid gap-4 md:grid-cols-3">
					<FormField
						type="number"
						class="no-spin"
						label="Market value"
						name="propertyMarketValue"
						step="0.01"
						value={form?.values?.propertyMarketValue ?? ''}
						error={form?.errors?.propertyMarketValue?.[0]}
						required
					/>

					<FormField
						type="text"
						label="Sale date (MM YYYY)"
						name="propertySaleDate"
						inputmode="numeric"
						value={form?.values?.propertySaleDate ?? ''}
						error={form?.errors?.propertySaleDate?.[0]}
					/>

					<FormField
						type="number"
						class="no-spin"
						label="Market growth rate (%)"
						name="propertyMarketGrowthRate"
						step="0.5"
						value={form?.values?.propertyMarketGrowthRate ?? '5.0'}
						error={form?.errors?.propertyMarketGrowthRate?.[0]}
						required
					/>
				</div>

				<div class="grid gap-4 md:grid-cols-3">
					<FormField
						type="number"
						class="no-spin"
						label="Fixed selling costs"
						name="propertyFixedSellingCosts"
						step="0.01"
						value={form?.values?.propertyFixedSellingCosts ?? '10000'}
						error={form?.errors?.propertyFixedSellingCosts?.[0]}
						required
					/>
					<FormField
						type="number"
						class="no-spin"
						label="Variable selling costs (%)"
						name="propertyVariableSellingCosts"
						step="0.01"
						value={form?.values?.propertyVariableSellingCosts ?? '1.65'}
						error={form?.errors?.propertyVariableSellingCosts?.[0]}
						required
					/>
				</div>
			</FormSection>
		{/if}

		{#if selectedType === 'mortgage'}
			<FormSection title={`${assetTypeLabel} DETAILS`}>
				<label class="grid gap-2 text-sm font-medium text-slate-700">
					Secured by property
					<select
						name="mortgagePropertyId"
						class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
						required
					>
						<option value="" disabled selected={(form?.values?.mortgagePropertyId ?? '') === ''}>
							Select a property
						</option>
						{#each data.properties as property}
							<option
								value={property.id}
								selected={(form?.values?.mortgagePropertyId ?? '') === property.id}
							>
								{property.name}
							</option>
						{/each}
					</select>
					{#if form?.errors?.mortgagePropertyId?.[0]}
						<span class="text-xs text-rose-600">{form.errors.mortgagePropertyId[0]}</span>
					{/if}
				</label>

				<div class="grid gap-4 md:grid-cols-2">
					<FormField
						type="number"
						class="no-spin"
						label="Term remaining (years)"
						name="mortgageTermYears"
						min="0"
						step="1"
						value={form?.values?.mortgageTermYears ?? ''}
						error={form?.errors?.mortgageTermYears?.[0]}
						required
					/>
					<FormField
						type="number"
						class="no-spin"
						label="Term remaining (months)"
						name="mortgageTermMonths"
						min="0"
						max="11"
						step="1"
						value={form?.values?.mortgageTermMonths ?? ''}
						error={form?.errors?.mortgageTermMonths?.[0]}
						required
					/>
				</div>

				<label class="flex items-center gap-2 text-sm font-medium text-slate-700">
					<input
						type="checkbox"
						name="mortgageInterestOnly"
						bind:checked={mortgageInterestOnly}
						class="h-4 w-4 rounded border-slate-300 text-slate-900"
					/>
					Interest-only period
				</label>

				{#if mortgageInterestOnly}
					<FormField
						type="text"
						label="Interest-only ends (MM YYYY)"
						name="mortgageInterestOnlyEnd"
						inputmode="numeric"
						value={form?.values?.mortgageInterestOnlyEnd ?? ''}
						error={form?.errors?.mortgageInterestOnlyEnd?.[0]}
						required
					/>
				{/if}
			</FormSection>
		{/if}

		<FormSection title="Cashflows">
			{#if selectedType === 'person'}
				<div class="grid gap-4">
					<FormField
						type="number"
						class="no-spin"
						label="Monthly essential expenses"
						name="essentialExpenses"
						step="0.01"
						value={form?.values?.essentialExpenses ?? ''}
						error={form?.errors?.essentialExpenses?.[0]}
						required
					/>

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
							<span class="text-xs text-rose-600">
								{form.errors.expenseAccountChoice[0]}
							</span>
						{/if}
					</label>

					{#if expenseAccountChoice === 'new'}
						<div class="grid gap-4 md:grid-cols-3">
							<FormField
								label="Account name"
								name="expenseAccountName"
								value={form?.values?.expenseAccountName ?? ''}
								error={form?.errors?.expenseAccountName?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Interest rate (%)"
								name="expenseAccountInterestRate"
								step="0.01"
								value={form?.values?.expenseAccountInterestRate ?? ''}
								error={form?.errors?.expenseAccountInterestRate?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Opening balance"
								name="expenseAccountOpeningBalance"
								step="0.01"
								value={form?.values?.expenseAccountOpeningBalance ?? ''}
								error={form?.errors?.expenseAccountOpeningBalance?.[0]}
								required
							/>
						</div>
					{/if}
				</div>

				<div class="mt-4 grid gap-4">
					<FormField
						type="number"
						class="no-spin"
						label="Monthly net employment income"
						name="employmentIncome"
						step="0.01"
						value={form?.values?.employmentIncome ?? ''}
						error={form?.errors?.employmentIncome?.[0]}
					/>

					<label class="flex items-center gap-2 text-sm font-medium text-slate-700">
						<input
							type="checkbox"
							name="useSameAccount"
							bind:checked={useSameAccount}
							class="h-4 w-4 rounded border-slate-300 text-slate-900"
						/>
						Use same account as expenses
					</label>

					{#if useSameAccount}
						<input type="hidden" name="incomeAccountChoice" value={expenseAccountChoice} />
						{#if expenseAccountChoice === 'new'}
							<input
								type="hidden"
								name="incomeAccountName"
								value={form?.values?.expenseAccountName ?? ''}
							/>
							<input
								type="hidden"
								name="incomeAccountInterestRate"
								value={form?.values?.expenseAccountInterestRate ?? ''}
							/>
							<input
								type="hidden"
								name="incomeAccountOpeningBalance"
								value={form?.values?.expenseAccountOpeningBalance ?? ''}
							/>
						{/if}
					{:else}
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
									value={form?.values?.incomeAccountName ?? ''}
									error={form?.errors?.incomeAccountName?.[0]}
									required
								/>
								<FormField
									type="number"
									class="no-spin"
									label="Interest rate (%)"
									name="incomeAccountInterestRate"
									step="0.01"
									value={form?.values?.incomeAccountInterestRate ?? ''}
									error={form?.errors?.incomeAccountInterestRate?.[0]}
									required
								/>
								<FormField
									type="number"
									class="no-spin"
									label="Opening balance"
									name="incomeAccountOpeningBalance"
									step="0.01"
									value={form?.values?.incomeAccountOpeningBalance ?? ''}
									error={form?.errors?.incomeAccountOpeningBalance?.[0]}
									required
								/>
							</div>
						{/if}
					{/if}
				</div>
			{/if}

			{#if selectedType === 'property'}
				<div class="grid gap-4">
					<FormField
						type="number"
						class="no-spin"
						label="Monthly ownership expense"
						name="propertyOwnershipExpense"
						step="0.01"
						value={form?.values?.propertyOwnershipExpense ?? ''}
						error={form?.errors?.propertyOwnershipExpense?.[0]}
						required
					/>

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
								value={form?.values?.expenseAccountName ?? ''}
								error={form?.errors?.expenseAccountName?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Interest rate (%)"
								name="expenseAccountInterestRate"
								step="0.01"
								value={form?.values?.expenseAccountInterestRate ?? ''}
								error={form?.errors?.expenseAccountInterestRate?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Opening balance"
								name="expenseAccountOpeningBalance"
								step="0.01"
								value={form?.values?.expenseAccountOpeningBalance ?? ''}
								error={form?.errors?.expenseAccountOpeningBalance?.[0]}
								required
							/>
						</div>
					{/if}
				</div>
			{/if}

			{#if selectedType === 'mortgage'}
				<div class="grid gap-4">
					<FormField
						label="Account name"
						name="mortgageAccountName"
						value={form?.values?.mortgageAccountName ?? ''}
						error={form?.errors?.mortgageAccountName?.[0]}
						required
					/>

					<div class="grid gap-4 md:grid-cols-2">
						<FormField
							type="number"
							class="no-spin"
							label="Interest rate (%)"
							name="mortgageAccountInterestRate"
							step="0.01"
							value={form?.values?.mortgageAccountInterestRate ?? ''}
							error={form?.errors?.mortgageAccountInterestRate?.[0]}
							required
						/>
						<FormField
							type="number"
							class="no-spin"
							label="Opening balance"
							name="mortgageAccountOpeningBalance"
							step="0.01"
							value={form?.values?.mortgageAccountOpeningBalance ?? ''}
							error={form?.errors?.mortgageAccountOpeningBalance?.[0]}
							required
						/>
					</div>
				</div>

				<div class="mt-4 grid gap-4">
					<label class="grid gap-2 text-sm font-medium text-slate-700">
						Payment source account
						<select
							name="mortgagePaymentSourceChoice"
							class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
							required
							bind:value={mortgagePaymentSourceChoice}
						>
							<option value="" disabled selected={mortgagePaymentSourceChoice === ''}>
								Select an account
							</option>
							<option value="new">Create new current account</option>
							{#each data.currentAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
						{#if form?.errors?.mortgagePaymentSourceChoice?.[0]}
							<span class="text-xs text-rose-600">
								{form.errors.mortgagePaymentSourceChoice[0]}
							</span>
						{/if}
					</label>

					{#if mortgagePaymentSourceChoice === 'new'}
						<div class="grid gap-4 md:grid-cols-3">
							<FormField
								label="Account name"
								name="mortgagePaymentSourceName"
								value={form?.values?.mortgagePaymentSourceName ?? ''}
								error={form?.errors?.mortgagePaymentSourceName?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Interest rate (%)"
								name="mortgagePaymentSourceInterestRate"
								step="0.01"
								value={form?.values?.mortgagePaymentSourceInterestRate ?? ''}
								error={form?.errors?.mortgagePaymentSourceInterestRate?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Opening balance"
								name="mortgagePaymentSourceOpeningBalance"
								step="0.01"
								value={form?.values?.mortgagePaymentSourceOpeningBalance ?? ''}
								error={form?.errors?.mortgagePaymentSourceOpeningBalance?.[0]}
								required
							/>
						</div>
					{/if}
				</div>

				<div class="mt-4 grid gap-4">
					<label class="grid gap-2 text-sm font-medium text-slate-700">
						Offset account
						<select
							name="mortgageOffsetChoice"
							class="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
							bind:value={mortgageOffsetChoice}
						>
							<option value="none">None</option>
							<option value="same_as_payment_source">Same as payment source</option>
							<option value="new">Create new current account</option>
							{#each data.currentAccounts as account}
								<option value={account.id}>{account.name}</option>
							{/each}
						</select>
						{#if form?.errors?.mortgageOffsetChoice?.[0]}
							<span class="text-xs text-rose-600">
								{form.errors.mortgageOffsetChoice[0]}
							</span>
						{/if}
					</label>

					{#if mortgageOffsetChoice === 'new'}
						<div class="grid gap-4 md:grid-cols-3">
							<FormField
								label="Account name"
								name="mortgageOffsetName"
								value={form?.values?.mortgageOffsetName ?? ''}
								error={form?.errors?.mortgageOffsetName?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Interest rate (%)"
								name="mortgageOffsetInterestRate"
								step="0.01"
								value={form?.values?.mortgageOffsetInterestRate ?? ''}
								error={form?.errors?.mortgageOffsetInterestRate?.[0]}
								required
							/>
							<FormField
								type="number"
								class="no-spin"
								label="Opening balance"
								name="mortgageOffsetOpeningBalance"
								step="0.01"
								value={form?.values?.mortgageOffsetOpeningBalance ?? ''}
								error={form?.errors?.mortgageOffsetOpeningBalance?.[0]}
								required
							/>
						</div>
					{/if}
				</div>
			{/if}
		</FormSection>

		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" class="rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
				Create asset
			</Button>
			<a class="text-sm font-semibold text-slate-600 hover:text-slate-900" href="/assets">
				Cancel
			</a>
		</div>
	</form>
</section>


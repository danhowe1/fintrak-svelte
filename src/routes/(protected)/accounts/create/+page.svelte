<script lang="ts">
	import type { ActionData } from './$types';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import FormField from '$lib/components/forms/FormField.svelte';
	import FormSection from '$lib/components/forms/FormSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { getCurrentMonthYearInput } from '$lib/yearMonth';

	let { form }: { form: ActionData } = $props();

	type AccountCreateContext = {
		scenario: { id: string; name: string };
		people: Array<{ id: string; name: string }>;
	};

	const formErrors = $derived((form?.errors ?? {}) as Record<string, string[]>);
	const formValues = $derived((form?.values ?? {}) as Record<string, string>);
	const selectedPersonIds = $derived(
		Array.isArray(form?.values?.personIds) ? form?.values?.personIds : null
	);
	const fallbackStartMonth = getCurrentMonthYearInput();
	const defaultStartMonth = $derived(
		formValues.startDate ??
			$page.url.searchParams.get('defaultStartMonth') ??
			fallbackStartMonth
	);

	let accountTypeSelect: HTMLSelectElement | null = null;
	let context = $state<AccountCreateContext | null>(null);
	let contextError = $state('');
	let isContextLoading = $state(true);

	const loadContext = async () => {
		isContextLoading = true;
		contextError = '';
		try {
			const response = await fetch(`${$page.url.pathname}/data`);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? 'Unable to load form details.');
			}
			context = (await response.json()) as AccountCreateContext;
		} catch (error) {
			contextError = error instanceof Error ? error.message : 'Unable to load form details.';
		} finally {
			isContextLoading = false;
		}
	};

	onMount(async () => {
		void loadContext();
		await tick();
		accountTypeSelect?.focus();
	});
</script>

<h1>Add account</h1>
<p class="app-text-muted">Scenario: {context?.scenario.name ?? 'Loading scenario...'}</p>

<section class="not-prose app-panel mt-6">
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
	{#if contextError}
		<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
			{contextError}
		</div>
	{/if}
	<form method="POST" class="grid gap-6">
		<FormSection title="Account details">
			<div class="grid gap-4 md:grid-cols-4">
				<label class="app-label">
					Type
					<select
						name="accountType"
						bind:this={accountTypeSelect}
						class="app-input"
						required
						value={formValues.accountType ?? 'cash_account'}
					>
						<option value="cash_account">Cash account</option>
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
					type="text"
					label="Start date (MM YYYY)"
					name="startDate"
					inputmode="numeric"
					value={defaultStartMonth}
					error={formErrors.startDate?.[0]}
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
			{#if isContextLoading}
				<div class="space-y-2">
					<div class="h-4 w-56 animate-pulse rounded bg-slate-200"></div>
					<div class="h-4 w-48 animate-pulse rounded bg-slate-200"></div>
				</div>
			{:else if (context?.people.length ?? 0) === 0}
				<p class="app-text-muted">No people available to assign to this account.</p>
			{:else}
				<div class="flex flex-wrap items-center gap-4 text-sm text-slate-700">
					{#each context?.people ?? [] as person}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name="personIds"
								value={person.id}
								checked={(selectedPersonIds ?? (context?.people ?? []).map((p) => p.id)).includes(person.id)}
								class="h-4 w-4 rounded border-slate-300 text-slate-900"
								disabled={isContextLoading}
							/>
							<span>{person.name}</span>
						</label>
					{/each}
				</div>
				{#if formErrors.personIds?.[0]}
					<span class="text-xs text-rose-600">{formErrors.personIds[0]}</span>
				{/if}
			{/if}
		</FormSection>

		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" variant="primary" size="sm" disabled={isContextLoading || !!contextError}>
				{isContextLoading ? 'Loading form...' : 'Add account'}
			</Button>
			<a
				class="text-sm font-semibold text-slate-600 hover:text-slate-900"
				href="/dashboard?whatIfTab=accounts#what-if-panel"
			>
				Cancel
			</a>
		</div>
	</form>
</section>

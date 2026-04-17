<script lang="ts">
	import { tick } from 'svelte';
	import ScenarioProjectionPanel from '$lib/components/scenarios/ScenarioProjectionPanel.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let cloneForm: HTMLFormElement | null = null;
	let deleteForm: HTMLFormElement | null = null;
	let pendingCloneScenarioId = '';
	let pendingCloneScenarioName = '';
	let pendingDeleteScenarioId = '';
	let pendingDeleteScenarioName = '';

	const promptCloneScenario = async (scenarioId: string, scenarioName: string) => {
		const nextName = window.prompt('New scenario name', `${scenarioName} Copy`)?.trim() ?? '';
		if (!nextName) return;
		pendingCloneScenarioId = scenarioId;
		pendingCloneScenarioName = nextName;
		await tick();
		cloneForm?.requestSubmit();
	};

	const openDeleteConfirm = (scenarioId: string, scenarioName: string) => {
		pendingDeleteScenarioId = scenarioId;
		pendingDeleteScenarioName = scenarioName;
	};

	const cancelDeleteScenario = () => {
		pendingDeleteScenarioId = '';
		pendingDeleteScenarioName = '';
	};

	const confirmDeleteScenario = () => {
		deleteForm?.requestSubmit();
	};
</script>

<h1>Scenarios</h1>
<p class="app-text-muted">Select a scenario to view its cashflows.</p>

{#if data.scenarioProjections.length > 0}
	<section class="mt-6">
		<ScenarioProjectionPanel
			scenarioProjections={data.scenarioProjections}
			initialProjectionRange={data.projectionRange}
		/>
	</section>
{/if}

<section class="mt-6">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<p class="app-text-muted">Manage and create scenarios.</p>
		<a href="/scenarios/create" class="app-btn-primary-sm"> Create scenario </a>
	</div>
</section>

<section class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
	{#if form?.error}
		<div
			class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-5"
		>
			{form.error}
		</div>
	{/if}

	{#if data.scenarios.length === 0}
		<div class="app-panel sm:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-5">
			<p class="app-text-muted">No scenarios found.</p>
		</div>
	{:else}
		{#each data.scenarios as scenario}
			<div class="app-panel flex h-full flex-col justify-between gap-4">
				<div class="flex items-start justify-between gap-3">
					{#if scenario.is_owner}
						<form method="POST" action="?/rename" class="min-w-0 flex-1">
							<input type="hidden" name="scenarioId" value={scenario.id} />
							<input
								type="text"
								name="scenarioName"
								value={scenario.name}
								class="app-title-lg w-full rounded-md border border-transparent bg-transparent px-0 py-0 text-slate-900 transition outline-none focus:border-slate-300 focus:bg-white focus:px-2 focus:py-1"
								aria-label="Scenario name"
								title="Press Enter to save"
								onblur={(event) => {
									const input = event.currentTarget as HTMLInputElement;
									if (input.value.trim() === scenario.name) return;
									input.form?.requestSubmit();
								}}
							/>
						</form>
					{:else}
						<h2 class="app-title-lg min-w-0 flex-1 truncate">{scenario.name}</h2>
					{/if}
					{#if scenario.is_owner}
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
							onclick={() => openDeleteConfirm(scenario.id, scenario.name)}
							aria-label={`Delete ${scenario.name}`}
							title="Delete scenario"
						>
							<svg
								viewBox="0 0 24 24"
								aria-hidden="true"
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 6h18" />
								<path d="M8 6V4h8v2" />
								<path d="M19 6l-1 14H6L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
							</svg>
						</button>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="secondary"
						size="xs"
						onclick={() => promptCloneScenario(scenario.id, scenario.name)}
					>
						Clone
					</Button>
					<a href={`/dashboard?scenarioId=${scenario.id}`} class="app-btn-secondary-xs">
						View dashboard
					</a>
				</div>
			</div>
		{/each}
	{/if}
</section>

<form method="POST" action="?/clone" bind:this={cloneForm} class="hidden">
	<input type="hidden" name="scenarioId" value={pendingCloneScenarioId} />
	<input type="hidden" name="scenarioName" value={pendingCloneScenarioName} />
</form>

<form method="POST" action="?/delete" bind:this={deleteForm} class="hidden">
	<input type="hidden" name="scenarioId" value={pendingDeleteScenarioId} />
</form>

<ConfirmDialog
	open={Boolean(pendingDeleteScenarioId)}
	title="Delete scenario?"
	message={`"${pendingDeleteScenarioName}" and everything in it will be permanently removed.`}
	confirmLabel="Delete"
	cancelLabel="Cancel"
	onCancel={cancelDeleteScenario}
	onConfirm={confirmDeleteScenario}
/>

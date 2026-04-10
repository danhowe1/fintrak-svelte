<script lang="ts">
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let deleteForm: HTMLFormElement | null = null;
	let pendingDeleteScenarioId = '';
	let pendingDeleteScenarioName = '';

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

<section class="mt-6">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<p class="app-text-muted">Manage and create scenarios.</p>
		<a href="/scenarios/create" class="app-btn-primary-sm"> Create scenario </a>
	</div>
</section>

<section class="mt-2 grid gap-4">
	{#if form?.error}
		<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
			{form.error}
		</div>
	{/if}

	{#if data.scenarios.length === 0}
		<div class="app-panel">
			<p class="app-text-muted">No scenarios found.</p>
		</div>
	{:else}
		{#each data.scenarios as scenario}
			<div class="app-panel">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 class="app-title-lg">{scenario.name}</h2>
						<div class="app-text-muted mt-2"></div>
					</div>

					<div class="flex items-center gap-2">
						{#if scenario.is_owner}
							<Button
								type="button"
								variant="danger"
								size="xs"
								onclick={() => openDeleteConfirm(scenario.id, scenario.name)}
							>
								Delete scenario
							</Button>
						{/if}

						<a href={`/dashboard?scenarioId=${scenario.id}`} class="app-btn-primary-sm">
							View dashboard
						</a>
					</div>
				</div>
			</div>
		{/each}
	{/if}
</section>

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

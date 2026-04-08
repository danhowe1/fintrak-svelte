<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
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

					<a href={`/dashboard?scenarioId=${scenario.id}`} class="app-btn-primary-sm">
						View dashboard
					</a>
				</div>
			</div>
		{/each}
	{/if}
</section>

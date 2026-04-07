<script lang="ts">
	let {
		expanded,
		onToggle,
		labelExpanded = 'Hide details',
		labelCollapsed = 'Show details'
	} = $props<{
		expanded: boolean;
		onToggle: () => void;
		labelExpanded?: string;
		labelCollapsed?: string;
	}>();

</script>

<button
	type="button"
	class="flex items-center justify-end text-slate-500 hover:text-slate-700"
	aria-label={expanded ? labelExpanded : labelCollapsed}
	title={expanded ? labelExpanded : labelCollapsed}
	onclick={onToggle}
>
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="h-4 w-4"
	>
		<path d="M5 12h14" />
		{#if !expanded}
			<path d="M12 5v14" />
		{/if}
	</svg>
</button>

<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let { label, error, class: className = '', ...rest } = $props<
		HTMLInputAttributes & {
			label: string;
			error?: string;
		}
	>();
</script>

<label class="grid gap-2 text-sm font-medium text-slate-700">
	{label}
	<input
		{...rest}
		class={`w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none ${className}`.trim()}
	/>
	{#if error}
		<span class="text-xs text-rose-600">{error}</span>
	{/if}
</label>

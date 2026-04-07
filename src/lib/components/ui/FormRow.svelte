<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children } = $props<{ label: string; children?: Snippet }>();
</script>

<div class="mt-2 grid grid-cols-[140px_1fr] items-center gap-1 text-xs text-slate-600">
	<span class="truncate text-slate-500">{label}</span>
	<div class="ml-auto">
		{@render children?.()}
	</div>
</div>

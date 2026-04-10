<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children } = $props<{ label: string; children?: Snippet }>();
</script>

<div
	class="app-label-compact mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] items-center gap-1 sm:grid-cols-[112px_minmax(0,1fr)]"
>
	<span class="truncate text-slate-500">{label}</span>
	<div class="w-full min-w-0 max-w-none justify-self-end">
		{@render children?.()}
	</div>
</div>

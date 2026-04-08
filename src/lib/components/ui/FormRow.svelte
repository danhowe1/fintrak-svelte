<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children } = $props<{ label: string; children?: Snippet }>();
</script>

<div
	class="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] items-center gap-1 text-xs text-slate-600 sm:grid-cols-[140px_minmax(0,1fr)]"
>
	<span class="truncate text-slate-500">{label}</span>
	<div class="min-w-0 w-full max-w-[8rem] justify-self-end">
		{@render children?.()}
	</div>
</div>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let { class: className = '', type = 'button', children, ...rest } = $props<
		HTMLButtonAttributes & {
			children: import('svelte').Snippet;
		}
	>();
</script>

<button
	{...rest}
	type={type}
	class={`rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 ${className}`.trim()}
>
	{@render children()}
</button>

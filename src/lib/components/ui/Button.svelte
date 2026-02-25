<script lang="ts">
	let { class: className = '', type = 'button', children } = $props<{
		class?: string;
		type?: 'button' | 'submit' | 'reset';
		children: import('svelte').Snippet;
	}>();
</script>

<button
	type={type}
	class={`rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 ${className}`.trim()}
>
	{@render children()}
</button>

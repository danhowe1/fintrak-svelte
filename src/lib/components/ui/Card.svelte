<script lang="ts">
	let { class: className = '', children } = $props<{
		class?: string;
		children: import('svelte').Snippet;
	}>();
</script>

<section class={`rounded-xl border border-slate-200 bg-slate-50 p-8 shadow-sm ${className}`.trim()}>
	{@render children()}
</section>
